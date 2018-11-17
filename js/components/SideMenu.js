import PropTypes from 'prop-types'
import React, {Component} from 'react'
import {
  ScrollView,
  Text,
  View,
  Alert,
  AsyncStorage,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import keyHolder from '../constants/keys.js'
import Spinner from 'react-native-loading-spinner-overlay'
import EntypoIcon from 'react-native-vector-icons/Entypo'
import MaterialIcon from 'react-native-vector-icons/MaterialIcons'
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons'
import ImagePicker from 'react-native-image-picker'
import { material, systemWeights } from 'react-native-typography'
import schemas from '../constants/schemas.js'
import colorConstants from '../constants/colors.js'
import { NavigationActions } from 'react-navigation'

const AnimatedIcon = Animated.createAnimatedComponent(EntypoIcon)
UIManager.setLayoutAnimationEnabledExperimental && UIManager.setLayoutAnimationEnabledExperimental(true);

export default class SideMenu extends Component {
  constructor(props) {
    super(props)
    this.state = {
      scaleAnim: new Animated.Value(1),
      expandUpload: false,
      uploading: false,
      current: 0
    }
  }

  componentDidMount = function () {
    // Animated.timing(
    //   this.state.scaleAnim,
    //   { toValue: 1 }
    // ).start();
  }

  bounceVisibility = () => {
    // console.log('bbb')
    Animated.sequence([
      Animated.timing(this.state.scaleAnim, {toValue: 0.8, duration: 100, easing: Easing.elastic()}),
      Animated.timing(this.state.scaleAnim, {toValue: 1.15, duration: 200, easing: Easing.elastic()}),
      Animated.timing(this.state.scaleAnim, {toValue: 1, duration: 200})
    ]).start()
  }

  navigate = (screenName, current) => {
    this.props.navigation.navigate(screenName)
    this.setState({ current })
  }

  toggleUploadDropdown = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    this.setState({ expandUpload: !this.state.expandUpload })
  }

  clickUploadImage = () => {
    ImagePicker.launchImageLibrary({}, (response) => {
      if (response.didCancel) {
        console.log('User cancelled image picker');
      } else if (response.error) {
        console.log('ImagePicker Error: ', response.error);
      } else if (response.customButton) {
        console.log('User tapped custom button: ', response.customButton);
      } else {
        this.upload(response)

        // this.upload(response.fileName, response.fileSize)
        // const source = { uri: response.uri };
    
        // You can also display the image using data:
        // const source = { uri: 'data:image/jpeg;base64,' + response.data };
      }
    })
    
  }

  clickUploadCamera = () => {
    const options = {
      storageOptions: {
        skipBackup: true,
        path: 'Argus',
      }
    }
    ImagePicker.launchCamera(options, (response) => {
      if (response.didCancel) {
        console.log('User cancelled image picker');
      } else if (response.error) {
        console.log('ImagePicker Error: ', response.error);
      } else if (response.customButton) {
        console.log('User tapped custom button: ', response.customButton);
      } else {
        this.upload(response)
        // const source = { uri: response.uri };
    
        // You can also display the image using data:
        // const source = { uri: 'data:image/jpeg;base64,' + response.data };
      }
    })
  }

  upload = async (imageResponse) => {
    if (!imageResponse.timestamp) imageResponse.timestamp = new Date() // timestamp is only available when a photo is taken (in android)
    let response
    try {
      // Open the database
      const realm = await Realm.open({ schema: schemas.all })

      // Remove any failed matches if they exist
      const failedMatches = realm.objects(schemas.FailedIdentifiedItemSchema.name).filtered('id == $0', imageResponse.fileName)
      if (failedMatches.length > 0) realm.write(() => realm.delete(failedMatches))

      // If there's already a success, open the details page
      const successMatches = realm.objects(schemas.IdentifiedItemSchema.name).filtered('id == $0', imageResponse.fileName)
      const successVals = successMatches.values()
      if (successMatches.length > 0) {
        // There should never be more than 1 success match, but do this anyways
        for (const item of successVals) {
          const copy = { ...item }
          copy.image.base64 = imageResponse.data
          this.props.navigation.navigate('DetailsScreen', copy)
        }
        return
      }

      // Get the host
      const host = await AsyncStorage.getItem('host')
      console.log('uploading to', host)

      this.setState({ uploading: true })

      // Send the request
      const formData = new FormData();
      formData.append('name', 'testName'); // you can append anyone.
      formData.append('photo', {
          uri: imageResponse.uri,
          type: 'image/jpeg', // or photo.type
          name: 'testPhotoName'
      })
      response = await fetch(host, {
          method: 'POST',
          body: formData
      })

      // If this is sent to a python flask server, then receive the POST(! not GET!) request as such:
      // file = request.files['photo']
      // file.save('./test.jpg')

      // Status code must be 200. res.ok is a boolean which checks this
      if (!response.ok) throw new Error(`Non-200 status code (${response.status})`)
      
      const classifications = await response.json() // jsonBody should be an array of objects with the keys specified in js/constants/schemas.ClassificationSchema.properties
      if (Object.keys(classifications).length === 0) Alert.alert('Aw man!', 'No matches found!')
      else {
        const formatted = {
          id: imageResponse.fileName,
          response: JSON.stringify(response, null, 2),
          image: {
            path: imageResponse.uri,
            width: imageResponse.width,
            height: imageResponse.height,
          },
          date: imageResponse.timestamp,
          classifications
        }

        realm.write(() => {
            realm.create(schemas.IdentifiedItemSchema.name, formatted, true)
        })

        formatted.image.base64 = imageResponse.data

        // Update history screen
        const setParamsAction = NavigationActions.setParams({
          params: { classifiedResults: [ formatted ] },
          key: keyHolder.get('HistoryScreen'),
        })
        this.props.navigation.dispatch(setParamsAction)

        // Then navigate to the details
        this.props.navigation.navigate('DetailsScreen', formatted)
      }
    } catch (err) {
      Realm.open({ schema: schemas.all })
      .then(realm => {
        realm.write(() => {
            realm.create(schemas.FailedIdentifiedItemSchema.name, {
                id: imageResponse.fileName,
                response: JSON.stringify(response, null, 2) || 'No response available',
                error: err.message,
                image: {
                    path: imageResponse.uri,
                    width: imageResponse.width,
                    height: imageResponse.height
                },
                date: imageResponse.timestamp
            }, true)
        })
        console.log('saved to failures')
        Alert.alert('Saved to Failures', err.message)
      })
      .catch(err => {
          Alert.alert('Error', err.message)
          console.log('realm pipeline err',  err)            
      })
    }
    this.setState({ uploading: false })
  }

  render () {
    const uploadDropdownViewStyle = this.state.expandUpload ? {  } : { height: 0, opacity: 0 }
    const uploadDropdownItemsStyle = this.state.expandUpload ? { overflow: 'hidden' } : { overflow: 'hidden', height: 0 }

    return (
      <View style={styles.container}>
        <ScrollView>
            <View style={{ ...styles.logoContainer}}>
                <Text style={ { ...material.headlineWhite, ...systemWeights.light }}>ARGUS</Text>
                <AnimatedIcon onPress={ this.bounceVisibility } style={{
                  transform: [
                    { scaleX: this.state.scaleAnim },
                    { scaleY: this.state.scaleAnim }
                    ]}} name="eye" size={140} color='white'/>
            </View>
            <TouchableOpacity style={styles.navItem} onPress={ () => { this.props.navigation.navigate('Login') } }>
              <MaterialCommunityIcon name='login' size={30} style={styles.navIcon}/><Text>Login</Text>
            </TouchableOpacity>
            <View style={styles.border}></View>

            <TouchableOpacity style={styles.navItem} onPress={ () => this.navigate('HomeScreen', 0) }>
              <MaterialIcon name='home' size={30} style={styles.navIcon}/><Text style={ this.state.current === 0 ? { fontWeight: 'bold' } : {} }>Home</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.navItem} onPress={ () => /*this.navigate('CameraScreen', 1)*/ this.toggleUploadDropdown() }>
              <MaterialIcon name='cloud-upload' size={30} style={styles.navIcon}/>
              <View style={styles.navItemDropdownView}>
                <Text style={this.state.current === 1 ? { ...styles.navItemDropdownText, fontWeight: 'bold', alignSelf: 'center' } : { ...styles.navItemDropdownText, alignSelf: 'center' } }>Upload</Text>
                <MaterialIcon name={this.state.expandUpload ? 'arrow-drop-up' : 'arrow-drop-down'} size={30} style={styles.navItemDropdownIcon}/>
              </View>

            </TouchableOpacity>
            

            <View style={uploadDropdownViewStyle}>
              <TouchableOpacity style={{...styles.subNavItem, ...uploadDropdownItemsStyle}} onPress={ this.clickUploadImage }>
                <MaterialIcon name='image' size={30} style={styles.navIcon}/><Text style={ this.state.current === 1 ? { fontWeight: 'bold' } : {} }>Image</Text>
              </TouchableOpacity>

              <TouchableOpacity style={{...styles.subNavItem, ...uploadDropdownItemsStyle}} onPress={ this.clickUploadCamera }>
                <MaterialIcon name='photo-camera' size={30} style={styles.navIcon}/><Text style={ this.state.current === 1 ? { fontWeight: 'bold' } : {} }>Camera</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.navItem} onPress={ () => this.navigate('HistoryScreen', 3) }>
              <MaterialIcon name='history' size={30} style={styles.navIcon}/><Text style={ this.state.current === 3 ? { fontWeight: 'bold' } : {} }>History</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.navItem} onPress={ () => this.navigate('SettingsScreen', 4) }>
              <MaterialIcon name='settings' size={30} style={styles.navIcon}/><Text style={ this.state.current === 4 ? { fontWeight: 'bold' } : {} }>Settings</Text>
            </TouchableOpacity>

            <View style={styles.border}></View>
            <TouchableOpacity style={styles.navItem} onPress={ () => {} }>
              <MaterialIcon name='feedback' size={30} style={styles.navIcon}/><Text>Send Feedback</Text>
            </TouchableOpacity>
        </ScrollView>
        <Spinner
          visible={this.state.uploading}
          textContent={'Uploading...'}
          textStyle={{ color: '#FFF' }}
          overlayColor='rgba(0, 0, 0, 0.75)'
          animation='fade'
          color={colorConstants.headerBackgroundColor}
        />
      </View>
    );
  }
}

SideMenu.propTypes = {
  navigation: PropTypes.object
};

const styles = StyleSheet.create({
    logoContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 15,
        backgroundColor: '#546E7A',
        marginBottom: 5,
        // transform: [
        //   {
        //     scaleX: .5
        //   }, {scaleY: .5}
        // ]
    },
    border: {
      borderBottomWidth: 1,
      borderBottomColor: '#EEEEEE',
      marginVertical: 7
    },
    logoText: {
        fontSize: 20,
        color: 'white'
    }, 
    container: {
        flex: 1
    },
    navIcon: {
        marginRight: 20,
        color: '#546E7A'
    },
    navItem: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingVertical: 10,
    },
    navItemDropdownView: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-between'
    },
    navItemDropdownText: {
      alignSelf: 'center'
    },
    navItemDropdownIcon: {
      marginRight: 5
    },
    subNavItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingRight: 10,
      paddingLeft: 50
    }
})