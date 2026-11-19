const fs=require('node:fs');
const path=require('node:path');
const {getDefaultConfig}=require('expo/metro-config');
const config=getDefaultConfig(__dirname);
const modules=fs.realpathSync(path.join(__dirname,'node_modules'));
config.watchFolders=[...(config.watchFolders||[]),modules];
config.resolver.nodeModulesPaths=[modules];
module.exports=config;
