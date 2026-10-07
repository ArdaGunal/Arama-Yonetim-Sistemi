const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const handler = `    val previousHandler = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
      try {
        val stack = StringWriter().also { throwable.printStackTrace(PrintWriter(it)) }.toString()
        getSharedPreferences("ays_diagnostics", Context.MODE_PRIVATE)
          .edit().putString("native_crash", stack.take(60000)).commit()
      } catch (loggingError: Throwable) {
        Log.e("AYS", "Native crash could not be saved", loggingError)
      } finally {
        previousHandler?.uncaughtException(thread, throwable)
      }
    }`;

module.exports = function withCrashInfo(config) {
  return withDangerousMod(config, ['android', async (mod) => {
    const packageName = mod.android?.package || 'com.ardagnl.aramayonetim';
    const sourceDir = path.join(
      mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'java',
      ...packageName.split('.')
    );
    fs.mkdirSync(sourceDir, { recursive: true });
    for (const file of ['CrashInfoModule.kt', 'CrashInfoPackage.kt']) {
      fs.copyFileSync(path.join(__dirname, '..', 'native-crash', file), path.join(sourceDir, file));
    }

    const applicationPath = path.join(sourceDir, 'MainApplication.kt');
    let application = fs.readFileSync(applicationPath, 'utf8');
    if (!application.includes('add(CrashInfoPackage())')) {
      const marker = 'PackageList(this).packages.apply {';
      if (!application.includes(marker)) throw new Error('MainApplication package marker missing');
      application = application.replace(marker, `${marker}\n              add(CrashInfoPackage())`);
    }
    if (!application.includes('val previousHandler = Thread.getDefaultUncaughtExceptionHandler()')) {
      const marker = 'ApplicationLifecycleDispatcher.onApplicationCreate(this)';
      if (!application.includes(marker)) throw new Error('MainApplication lifecycle marker missing');
      application = application.replace(marker, `${marker}\n${handler}`);
    }
    for (const line of [
      'import android.content.Context', 'import android.util.Log',
      'import java.io.PrintWriter', 'import java.io.StringWriter',
    ]) {
      if (!application.includes(line)) application = application.replace('import android.app.Application', `import android.app.Application\n${line}`);
    }
    fs.writeFileSync(applicationPath, application);
    return mod;
  }]);
};
