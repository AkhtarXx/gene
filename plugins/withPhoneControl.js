const fs = require('node:fs');
const path = require('node:path');
const {
  withAndroidManifest,
  withStringsXml,
  withMainApplication,
  withDangerousMod,
} = require('@expo/config-plugins');

function syncSources(root) {
  const source = path.join(root, 'native', 'phone-control');
  const java = path.join(root, 'android/app/src/main/java/com/openclaw/mobile');
  const xml = path.join(root, 'android/app/src/main/res/xml');
  fs.mkdirSync(java, { recursive: true });
  fs.mkdirSync(xml, { recursive: true });
  for (const name of ['PhoneControlService.kt', 'PhoneControlModule.kt'])
    fs.copyFileSync(path.join(source, name), path.join(java, name));
  fs.copyFileSync(
    path.join(source, 'phone_control_service.xml'),
    path.join(xml, 'phone_control_service.xml')
  );
}

module.exports = function withPhoneControl(config) {
  if (config.android?.package !== 'com.openclaw.mobile')
    throw new Error('Update phone control Kotlin package before changing application ID.');
  config = withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application[0];
    application.service = application.service || [];
    application.service = application.service.filter(
      (service) => service.$['android:name'] !== '.PhoneControlService'
    );
    application.service.push({
      $: {
        'android:name': '.PhoneControlService',
        'android:permission': 'android.permission.BIND_ACCESSIBILITY_SERVICE',
        'android:exported': 'true',
        'android:label': 'Gene personal control',
      },
      'intent-filter': [
        { action: [{ $: { 'android:name': 'android.accessibilityservice.AccessibilityService' } }] },
      ],
      'meta-data': [
        {
          $: {
            'android:name': 'android.accessibilityservice',
            'android:resource': '@xml/phone_control_service',
          },
        },
      ],
    });
    return mod;
  });
  config = withStringsXml(config, (mod) => {
    const items = mod.modResults.resources.string || [];
    mod.modResults.resources.string = items.filter((item) => item.$.name !== 'phone_control_description');
    mod.modResults.resources.string.push({
      $: { name: 'phone_control_description' },
      _: 'Personal APK: reads visible app content and performs individually approved taps, typing and scrolling. Enable a timed session inside Gene. Stop at any time using the floating STOP button.',
    });
    return mod;
  });
  config = withMainApplication(config, (mod) => {
    const marker = 'val packages = PackageList(this).packages';
    if (!mod.modResults.contents.includes('packages.add(PhoneControlPackage())')) {
      if (!mod.modResults.contents.includes(marker))
        throw new Error('Cannot register PhoneControlPackage: MainApplication changed.');
      mod.modResults.contents = mod.modResults.contents.replace(
        marker,
        `${marker}\n            packages.add(PhoneControlPackage())`
      );
    }
    return mod;
  });
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      syncSources(mod.modRequest.projectRoot);
      return mod;
    },
  ]);
};
module.exports.syncSources = syncSources;
