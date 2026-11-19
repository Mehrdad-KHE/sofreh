import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,BackHandler,Pressable,StyleSheet,Text,View} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import {allowWorkspaceNavigation} from './navigation.mjs';

const config=Constants.expoConfig.extra;
const origin=config.origin;
const role=config.role==='COOK'?'cook':'customer';
const entry=origin+'/app/'+role;

// Two installed applications share the verified ordering UI and backend.
// Authentication stays in the isolated native WebView cookie store.
// A device location is passed only to the loaded Sofreh page, never to the API.
export default function App(){
  const web=useRef(null),currentURL=useRef(entry),canGoBack=useRef(false),locationBusy=useRef(false);
  const [failed,setFailed]=useState(false),[loading,setLoading]=useState(true),[key,setKey]=useState(0);
  useEffect(()=>{const listener=BackHandler.addEventListener('hardwareBackPress',()=>{if(canGoBack.current){web.current?.goBack();return true;}return false;});return()=>listener.remove();},[]);
  function reply(value){if(!currentURL.current.startsWith(origin+'/'))return;web.current?.injectJavaScript(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(JSON.stringify(value))}}));true;`);}
  async function onMessage(event){
    if(!currentURL.current.startsWith(origin+'/app/'))return;
    let message;try{message=JSON.parse(event.nativeEvent.data);}catch{return;}
    if(message.type!=='SOFREH_LOCATION_REQUEST'||locationBusy.current)return;
    locationBusy.current=true;
    try{const permission=await Location.requestForegroundPermissionsAsync();if(permission.status!=='granted'){reply({type:'SOFREH_LOCATION_RESULT',error:'denied'});return;}
      const result=await Promise.race([Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),20000))]);
      reply({type:'SOFREH_LOCATION_RESULT',coords:{latitude:result.coords.latitude,longitude:result.coords.longitude}});
    }catch{reply({type:'SOFREH_LOCATION_RESULT',error:'unavailable'});}finally{locationBusy.current=false;}
  }
  // WebView opens non-whitelisted origins with Linking before invoking the
  // callback. Route every URL through this policy to prevent Safari escape.
  function shouldStart(request){const allowed=allowWorkspaceNavigation(request,origin);if(!allowed&&request.isTopFrame!==false&&request.navigationType!=='click'){setFailed(true);setLoading(false);}return allowed;}
  return <SafeAreaProvider><SafeAreaView style={styles.root}><View style={styles.bar}><Text style={styles.brand}>{role==='cook'?'Sofreh Cook':'Sofreh'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Reload / بارگذاری دوباره" onPress={()=>{setFailed(false);setLoading(true);setKey(key+1);}} style={styles.reload}><Text>↻</Text></Pressable></View>
    {failed?<View style={styles.error}><Text style={styles.title}>Unable to open Sofreh</Text><Text style={styles.persian}>سفره باز نشد</Text><Text style={styles.description}>Please try again shortly. / کمی بعد دوباره تلاش کنید.</Text><Pressable style={styles.retry} accessibilityRole="button" onPress={()=>{setFailed(false);setLoading(true);setKey(key+1);}}><Text style={styles.retryText}>Try again / تلاش دوباره</Text></Pressable></View>:
    <WebView key={key} ref={web} source={{uri:entry}} style={styles.web} originWhitelist={['*']} javaScriptEnabled domStorageEnabled sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} mixedContentMode="never" allowsInlineMediaPlayback={false} mediaPlaybackRequiresUserAction setSupportMultipleWindows={false}
      onMessage={onMessage} onLoadStart={()=>setLoading(true)} onLoadEnd={()=>setLoading(false)} onError={()=>setFailed(true)} onHttpError={event=>{if(event.nativeEvent.statusCode>=500)setFailed(true);}}
      onNavigationStateChange={navigation=>{currentURL.current=navigation.url;canGoBack.current=navigation.canGoBack;}}
      onShouldStartLoadWithRequest={shouldStart}/>}
    {loading&&!failed?<View pointerEvents="none" style={styles.spinner}><ActivityIndicator size="large" color="#9c2940"/></View>:null}
  </SafeAreaView></SafeAreaProvider>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#fff9ef'},bar:{height:52,paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderColor:'#dedfd3'},brand:{fontSize:21,fontWeight:'800',color:'#23392f'},reload:{width:46,height:46,alignItems:'center',justifyContent:'center'},web:{flex:1,backgroundColor:'#fff9ef'},spinner:{position:'absolute',top:'45%',left:'45%'},error:{flex:1,justifyContent:'center',padding:28},title:{fontSize:24,fontWeight:'700',color:'#23392f',textAlign:'center'},persian:{fontSize:23,textAlign:'center',marginVertical:12,color:'#23392f'},description:{fontSize:16,lineHeight:26,textAlign:'center',color:'#5d6c62'},retry:{minHeight:50,marginTop:24,backgroundColor:'#23392f',borderRadius:12,alignItems:'center',justifyContent:'center'},retryText:{color:'#fff9ef',fontSize:17}});
