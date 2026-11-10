const role=process.env.SOFREH_APP_ROLE;
if(!['CUSTOMER','COOK'].includes(role))throw new Error('SOFREH_APP_ROLE must be CUSTOMER or COOK.');
const origin=new URL(process.env.SOFREH_APP_ORIGIN||'');
if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.username||origin.password||origin.search||origin.hash)throw new Error('SOFREH_APP_ORIGIN must be an HTTPS origin.');
const cook=role==='COOK';
module.exports={expo:{name:cook?'Sofreh Cook':'Sofreh Customer',slug:cook?'sofreh-cook':'sofreh-customer',version:'1.0.0',
  orientation:'default',scheme:cook?'sofreh-cook':'sofreh-customer',userInterfaceStyle:'light',icon:'./assets/app-icon.png',
  ios:{bundleIdentifier:cook?'ca.sofreh.cook':'ca.sofreh.customer',supportsTablet:cook,infoPlist:{NSLocationWhenInUseUsageDescription:'Sofreh uses your location only when you ask to show nearby kitchens. Your exact location is not stored on the server.',
    NSPhotoLibraryUsageDescription:'Choose a food photo when you upload a picture to a Sofreh menu.',
    NSCameraUsageDescription:'Take a food photo when you choose the camera while uploading a menu picture.'}},
  android:{package:cook?'ca.sofreh.cook':'ca.sofreh.customer',permissions:['ACCESS_COARSE_LOCATION','ACCESS_FINE_LOCATION'],blockedPermissions:['RECORD_AUDIO','ACCESS_BACKGROUND_LOCATION']},
  plugins:[['expo-location',{locationWhenInUsePermission:'Show approximate distances to nearby kitchens when you request it.'}]],
  extra:{role,origin:origin.origin},updates:{enabled:false}}};
