/**
 * Package Builder
 * Generates deployment packages for different platforms
 */

export interface PackageConfig {
  customerId: string;
  licenseKey: string;
  packageType: 'pm2' | 'exe' | 'portable';
  modules: string[];
  expiresAt: Date;
}

export interface PackageMetadata {
  id: string;
  customerId: string;
  licenseKey: string;
  packageType: string;
  modules: string[];
  createdAt: Date;
  expiresAt: Date;
  downloadUrl: string;
  instructions: string;
}

/**
 * Generate PM2 bundle configuration
 */
export function generatePM2Config(config: PackageConfig): string {
  return `
module.exports = {
  apps: [
    {
      name: 'clinic-app',
      script: './server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        LICENSE_KEY: '${config.licenseKey}',
        MODULES: '${config.modules.join(',')}',
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
`;
}

/**
 * Generate Windows installer script
 */
export function generateWindowsInstallerScript(config: PackageConfig): string {
  return `
@echo off
REM Clinic App Windows Installer
REM License Key: ${config.licenseKey}
REM Expires: ${config.expiresAt.toISOString()}

setlocal enabledelayedexpansion

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo This installer requires administrator privileges.
    pause
    exit /b 1
)

REM Set installation directory
set INSTALL_DIR=%ProgramFiles%\\ClinicApp

REM Create installation directory
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

REM Copy files
echo Installing files...
xcopy /E /I /Y ".\\*" "%INSTALL_DIR%\\"

REM Create license file
echo Creating license file...
(
    echo LICENSE_KEY=${config.licenseKey}
    echo MODULES=${config.modules.join(',')}
    echo EXPIRES=${config.expiresAt.toISOString()}
) > "%INSTALL_DIR%\\license.conf"

REM Create Windows shortcut
echo Creating shortcuts...
powershell -Command "
\\$WshShell = New-Object -ComObject WScript.Shell
\\$Shortcut = \\$WshShell.CreateShortcut('%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Clinic App.lnk')
\\$Shortcut.TargetPath = '%INSTALL_DIR%\\clinic-app.exe'
\\$Shortcut.WorkingDirectory = '%INSTALL_DIR%'
\\$Shortcut.Save()
"

REM Setup auto-start
echo Setting up auto-start...
reg add "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "ClinicApp" /t REG_SZ /d "%INSTALL_DIR%\\clinic-app.exe" /f

echo Installation complete!
echo License Key: ${config.licenseKey}
echo Expires: ${config.expiresAt.toISOString()}
pause
`;
}

/**
 * Generate portable executable configuration
 */
export function generatePortableConfig(config: PackageConfig): string {
  return JSON.stringify(
    {
      app: 'clinic-app',
      version: '1.0.0',
      license: {
        key: config.licenseKey,
        modules: config.modules,
        expiresAt: config.expiresAt.toISOString(),
      },
      portable: true,
      dataDir: './data',
      logsDir: './logs',
    },
    null,
    2
  );
}

/**
 * Generate installation instructions
 */
export function generateInstructions(config: PackageConfig): string {
  let instructions = '';

  switch (config.packageType) {
    case 'pm2':
      instructions = `
# PM2 Bundle Installation Guide

## Prerequisites
- Node.js 16+ installed
- PM2 installed globally: npm install -g pm2

## Installation Steps

1. Extract the bundle:
   tar -xzf clinic-app-pm2.tar.gz
   cd clinic-app

2. Install dependencies:
   npm install

3. Start the application:
   pm2 start ecosystem.config.js

4. Save PM2 configuration:
   pm2 save

5. Setup auto-start on boot:
   pm2 startup
   pm2 save

## License Information
- License Key: ${config.licenseKey}
- Expires: ${config.expiresAt.toISOString()}
- Modules: ${config.modules.join(', ')}

## Monitoring
- View logs: pm2 logs
- Monitor processes: pm2 monit
- List processes: pm2 list

## Troubleshooting
- Check logs: pm2 logs clinic-app
- Restart: pm2 restart clinic-app
- Stop: pm2 stop clinic-app
`;
      break;

    case 'exe':
      instructions = `
# Windows EXE Installation Guide

## Installation Steps

1. Download the installer: clinic-app-setup.exe

2. Run the installer:
   - Right-click on clinic-app-setup.exe
   - Select "Run as administrator"
   - Follow the installation wizard

3. Choose installation directory (default: C:\\Program Files\\ClinicApp)

4. Complete the installation

5. The application will be added to:
   - Start Menu
   - Auto-start on boot

## License Information
- License Key: ${config.licenseKey}
- Expires: ${config.expiresAt.toISOString()}
- Modules: ${config.modules.join(', ')}

## First Run
- The application will start automatically after installation
- License will be pre-configured
- Data will be stored in: C:\\Users\\[YourUsername]\\AppData\\Local\\ClinicApp

## Uninstallation
- Go to Control Panel > Programs > Programs and Features
- Find "Clinic App" and click Uninstall
- Follow the uninstall wizard

## Support
- For issues, check the logs in: C:\\Program Files\\ClinicApp\\logs
`;
      break;

    case 'portable':
      instructions = `
# Portable Executable Guide

## Installation Steps

1. Download: clinic-app-portable.exe

2. No installation needed!
   - Simply run the executable from any location
   - No administrator privileges required

3. First Run
   - Extract to desired location (optional)
   - Run clinic-app-portable.exe
   - Application will create data folder in same directory

## License Information
- License Key: ${config.licenseKey}
- Expires: ${config.expiresAt.toISOString()}
- Modules: ${config.modules.join(', ')}

## Data Storage
- All data is stored in the application directory
- You can move the entire folder to another location
- Backup the entire folder to backup your data

## Advantages
- No installation required
- Can run from USB drive
- Portable to any Windows computer
- No registry modifications

## Limitations
- Auto-start on boot not available
- Must manually run the executable each time

## Support
- Check logs in: ./logs directory
- All configuration in: ./config directory
`;
      break;
  }

  return instructions;
}

/**
 * Generate package metadata
 */
export function generatePackageMetadata(config: PackageConfig, downloadUrl: string): PackageMetadata {
  return {
    id: `pkg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    customerId: config.customerId,
    licenseKey: config.licenseKey,
    packageType: config.packageType,
    modules: config.modules,
    createdAt: new Date(),
    expiresAt: config.expiresAt,
    downloadUrl,
    instructions: generateInstructions(config),
  };
}
