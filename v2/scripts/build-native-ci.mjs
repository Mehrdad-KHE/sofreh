import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Use only an ephemeral, standard GitHub-hosted runner. Never build in the
// checkout, a synced workspace or the owner's system SDK/cache directories.
if (process.env.GITHUB_ACTIONS !== 'true' || !path.isAbsolute(process.env.RUNNER_TEMP || '')) {
  throw new Error('This command requires a GitHub-hosted build runner.');
}
const requestedPlatform = process.argv[2], deviceBuild=requestedPlatform==='ios-device';
const platform=deviceBuild?'ios':requestedPlatform, role = process.env.SOFREH_APP_ROLE;
if (!['android','ios','ios-device'].includes(requestedPlatform) || !['CUSTOMER','COOK'].includes(role)) throw new Error('Invalid platform or role.');
if (platform === 'ios' && process.platform !== 'darwin') throw new Error('iOS compilation requires macOS.');
const origin = new URL(process.env.SOFREH_APP_ORIGIN || '');
if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('Pass an HTTPS application origin.');
const root = path.resolve(process.env.RUNNER_TEMP,'ElegantRuntime','Sofreh');
const project = path.join(root,'native'), output = path.join(root,'artifacts');
const dirs = ['temp','expo','npm','gradle','android-user','pods','pods-cache','clang','swift','derived','artifacts'];
for (const dir of dirs) fs.mkdirSync(path.join(root,dir),{recursive:true});
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../apps/native');
fs.cpSync(source,project,{recursive:true,filter:file=>!['node_modules','android','ios','.expo','dist','build'].includes(path.basename(file))});
const env = {...process.env,CI:'1',EXPO_NO_TELEMETRY:'1',__UNSAFE_EXPO_HOME_DIRECTORY:path.join(root,'expo'),
  npm_config_cache:path.join(root,'npm'),TEMP:path.join(root,'temp'),TMP:path.join(root,'temp'),TMPDIR:path.join(root,'temp'),
  GRADLE_USER_HOME:path.join(root,'gradle'),ANDROID_USER_HOME:path.join(root,'android-user'),
  CP_HOME_DIR:path.join(root,'pods'),CP_CACHE_DIR:path.join(root,'pods-cache'),COCOAPODS_DISABLE_STATS:'true',
  CLANG_MODULE_CACHE_PATH:path.join(root,'clang'),SWIFT_MODULECACHE_PATH:path.join(root,'swift'),
  LANG:'en_US.UTF-8',LC_ALL:'en_US.UTF-8'};
function run(command,args,cwd=project,{capture=false}={}){
  const result=spawnSync(command,args,{cwd,env,encoding:'utf8',stdio:capture?'pipe':'inherit',windowsHide:true});
  if(result.error)throw result.error;
  if(result.status!==0){if(capture)console.error(result.stderr);throw new Error(`${command} exited ${result.status}`);}
  return result.stdout?.trim();
}
run('npm',['ci','--ignore-scripts','--no-audit','--no-fund']);
const cli=path.join(project,'node_modules/expo/bin/cli');
run(process.execPath,[cli,'prebuild','--no-install','--platform',platform]);
const id=role==='COOK'?'ca.sofreh.cook':'ca.sofreh.customer';
if(platform==='android'){
  const sdk=env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
  if(!sdk || !fs.existsSync(sdk))throw new Error('Use the runner-provided Android SDK.');
  // Reuse a provisioned NDK. Do not invoke sdkmanager --licenses or let Gradle
  // install SDK components implicitly. Missing tools must fail visibly.
  const ndk=env.ANDROID_NDK_HOME || env.ANDROID_NDK;
  const match=ndk && fs.readFileSync(path.join(ndk,'source.properties'),'utf8').match(/Pkg.Revision\s*=\s*(\S+)/);
  if(!match)throw new Error('No provisioned Android NDK found.');
  const rootGradle=path.join(project,'android/build.gradle');
  const gradleText=fs.readFileSync(rootGradle,'utf8');
  const rootPlugin='apply plugin: "expo-root-project"';
  if(!gradleText.includes(rootPlugin))throw new Error('Unrecognized generated Gradle template.');
  fs.writeFileSync(rootGradle,gradleText.replace(rootPlugin,`ext { ndkVersion = '${match[1]}' }\n${rootPlugin}`));
  console.log(`Using provisioned NDK ${match[1]}.`);
  // AGP expects CMake 3.22.1. Fetch the vendor's exact binary and verify its
  // published checksum instead of accepting SDK-manager licenses implicitly.
  const tooling=path.join(root,'tooling');fs.mkdirSync(tooling,{recursive:true});
  const archive='cmake-3.22.1-linux-x86_64.tar.gz';
  const release='https://github.com/Kitware/CMake/releases/download/v3.22.1/';
  const checksums=await fetch(release+'cmake-3.22.1-SHA-256.txt');
  if(!checksums.ok)throw new Error('CMake checksums unavailable.');
  const expected=(await checksums.text()).split('\n').find(line=>line.trim().endsWith(archive))?.split(/\s+/)[0];
  if(!/^[a-f0-9]{64}$/.test(expected||''))throw new Error('Missing vendor CMake checksum.');
  const response=await fetch(release+archive);if(!response.ok)throw new Error('CMake download failed.');
  const bytes=Buffer.from(await response.arrayBuffer());
  if(createHash('sha256').update(bytes).digest('hex')!==expected)throw new Error('CMake checksum mismatch.');
  fs.writeFileSync(path.join(tooling,archive),bytes);run('tar',['-xzf',path.join(tooling,archive),'-C',tooling]);
  const cmake=path.join(tooling,'cmake-3.22.1-linux-x86_64');
  run(path.join(cmake,'bin/cmake'),['--version']);
  fs.writeFileSync(path.join(project,'android/local.properties'),`sdk.dir=${sdk}\ncmake.dir=${cmake}\n`);
  run('bash',['./gradlew','app:assembleRelease','--no-daemon','--max-workers=2',
    '-PreactNativeArchitectures=arm64-v8a',
    '-Pandroid.builder.sdkDownload=false'],path.join(project,'android'));
  const apk=path.join(project,'android/app/build/outputs/apk/release/app-release.apk');
  const buildTools=path.join(sdk,'build-tools','37.0.0');
  const badging=run(path.join(buildTools,'aapt2'),['dump','badging',apk],project,{capture:true});
  if(!badging.includes(`name='${id}'`))throw new Error('APK application ID mismatch.');
  run(path.join(buildTools,'apksigner'),['verify',apk]);
  fs.copyFileSync(apk,path.join(output,`sofreh-${role.toLowerCase()}-android.apk`));
}else{
  run('pod',['install'],path.join(project,'ios'));
  const workspace=fs.readdirSync(path.join(project,'ios')).find(name=>name.endsWith('.xcworkspace'));
  if(!workspace)throw new Error('No generated Xcode workspace.');
  const scheme=workspace.slice(0,-'.xcworkspace'.length);
  const derived=path.join(root,'derived');
  run('xcodebuild',['-workspace',workspace,'-scheme',scheme,'-configuration','Release','-sdk',deviceBuild?'iphoneos':'iphonesimulator',
    '-destination',deviceBuild?'generic/platform=iOS':'generic/platform=iOS Simulator','-derivedDataPath',derived,
    'CODE_SIGNING_ALLOWED=NO','CODE_SIGNING_REQUIRED=NO',`ARCHS=${deviceBuild||process.arch==='arm64'?'arm64':'x86_64'}`,'ONLY_ACTIVE_ARCH=YES','build'],path.join(project,'ios'));
  const products=path.join(derived,'Build/Products',deviceBuild?'Release-iphoneos':'Release-iphonesimulator');
  const bundle=fs.readdirSync(products).find(name=>name.endsWith('.app'));
  if(!bundle)throw new Error('No simulator application produced.');
  const app=path.join(products,bundle);
  const bundleId=run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIdentifier',path.join(app,'Info.plist')],project,{capture:true});
  if(bundleId!==id)throw new Error('Simulator bundle ID mismatch.');
  for(const key of ['NSLocationWhenInUseUsageDescription','NSPhotoLibraryUsageDescription','NSCameraUsageDescription']){
    const purpose=run('/usr/libexec/PlistBuddy',['-c','Print :'+key,path.join(app,'Info.plist')],project,{capture:true});
    if(!purpose.trim())throw new Error('Missing iOS user permission purpose: '+key);
  }
  if(deviceBuild){
    const executable=run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleExecutable',path.join(app,'Info.plist')],project,{capture:true});
    const platformInfo=run('xcrun',['vtool','-show-build',path.join(app,executable)],project,{capture:true});
    if(!/platform\s+IOS\s/.test(platformInfo))throw new Error('Expected a physical-device Mach-O binary.');
    const payload=path.join(root,'Payload');fs.mkdirSync(payload,{recursive:true});
    fs.cpSync(app,path.join(payload,bundle),{recursive:true,verbatimSymlinks:true});
    run('ditto',['-c','-k','--keepParent',payload,path.join(output,`sofreh-${role.toLowerCase()}-ios-unsigned.ipa`)]);
  }else run('ditto',['-c','-k','--sequesterRsrc','--keepParent',app,path.join(output,`sofreh-${role.toLowerCase()}-ios-simulator.zip`)]);
}
fs.writeFileSync(path.join(output,'build-metadata.json'),JSON.stringify({role,platform:requestedPlatform,unsignedDeviceBuild:deviceBuild,applicationId:id,origin:origin.origin,
  revision:env.GITHUB_SHA,node:process.version,deviceAcceptance:false},null,2));
console.log('Internal build produced. Functional and real-device acceptance are separate.');
