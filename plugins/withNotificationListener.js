const { withDangerousMod, withAndroidManifest } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function registerPackage(mainApplication, packageName) {
  const importLine = `import ${packageName}.notification.NotificationListenerPackage`;
  let contents = mainApplication;

  if (!contents.includes(importLine)) {
    contents = contents.replace(
      '\nclass MainApplication',
      '\n' + importLine + '\n\nclass MainApplication'
    );
  }

  const packageRegistration = '          add(NotificationListenerPackage())';
  if (!contents.includes(packageRegistration)) {
    contents = contents.replace(
      '        PackageList(this).packages.apply {',
      '        PackageList(this).packages.apply {\n' + packageRegistration
    );
  }

  return contents;
}

function withNotificationListenerManifest(config) {
  return withAndroidManifest(config, async (manifestConfig) => {
    const manifest = manifestConfig.modResults;
    const application = manifest.manifest.application?.[0];

    if (!application) return manifestConfig;

    if (!application.service) {
      application.service = [];
    }

    const serviceName = '.notification.ClarityNotificationListenerService';
    const existingService = application.service.find(
      (s) => s.$?.['android:name'] === serviceName
    );

    if (!existingService) {
      application.service.push({
        $: {
          'android:name': serviceName,
          'android:label': '@string/app_name',
          'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name': 'android.service.notification.NotificationListenerService',
                },
              },
            ],
          },
        ],
      });
    }

    return manifestConfig;
  });
}

function withNotificationListenerNative(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const packageName = modConfig.android?.package || 'com.homerun.clarity';
      const packageDirectory = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        ...packageName.split('.')
      );
      const notificationDirectory = path.join(packageDirectory, 'notification');
      const mainApplicationPath = path.join(packageDirectory, 'MainApplication.kt');

      fs.mkdirSync(notificationDirectory, { recursive: true });

      if (fs.existsSync(mainApplicationPath)) {
        const mainApplication = fs.readFileSync(mainApplicationPath, 'utf8');
        fs.writeFileSync(
          mainApplicationPath,
          registerPackage(mainApplication, packageName)
        );
      }

      return modConfig;
    },
  ]);
}

module.exports = function withNotificationListener(config) {
  return withNotificationListenerNative(withNotificationListenerManifest(config));
};

