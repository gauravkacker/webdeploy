import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export async function POST(request: NextRequest) {
  try {
    const { version, releaseNotes, ghToken } = await request.json();

    if (!version || !ghToken) {
      return NextResponse.json(
        { message: 'Version and GitHub token are required' },
        { status: 400 }
      );
    }

    // Validate version format
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      return NextResponse.json(
        { message: 'Version must be in format: X.Y.Z' },
        { status: 400 }
      );
    }

    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    // Get GitHub config
    const owner = packageJson.build?.publish?.owner;
    const repo = packageJson.build?.publish?.repo;

    if (!owner || !repo) {
      return NextResponse.json(
        { message: 'GitHub configuration not found. Please configure GitHub first.' },
        { status: 400 }
      );
    }

    // Update version in package.json
    packageJson.version = version;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    // Set GitHub token
    process.env.GH_TOKEN = ghToken;

    try {
      // Commit changes
      console.log('Committing changes...');
      execSync('git add package.json', { cwd: process.cwd() });
      execSync(`git commit -m "chore: bump version to ${version}"`, { cwd: process.cwd() });
      execSync('git push', { cwd: process.cwd() });

      // Create GitHub release using gh CLI
      console.log('Creating GitHub release...');
      const releaseBody = releaseNotes || `Release ${version}`;
      execSync(
        `gh release create v${version} --title "Version ${version}" --notes "${releaseBody}"`,
        { cwd: process.cwd(), env: { ...process.env, GH_TOKEN: ghToken } }
      );

      // Build .exe automatically
      console.log('Building .exe file (this may take 5-10 minutes)...');
      try {
        execSync('npm run electron:build:prod', {
          cwd: process.cwd(),
          stdio: 'inherit',
          env: { ...process.env, GH_TOKEN: ghToken },
        });
      } catch (buildError) {
        console.error('Build failed:', buildError);
        throw new Error(`Failed to build .exe: ${buildError instanceof Error ? buildError.message : 'Unknown error'}`);
      }

      // Find and upload .exe to GitHub release
      console.log('Uploading .exe to GitHub release...');
      const distDir = path.join(process.cwd(), 'dist');
      let exeFile: string | null = null;

      if (fs.existsSync(distDir)) {
        const files = fs.readdirSync(distDir);
        const exe = files.find(f => f.endsWith('.exe'));
        if (exe) {
          exeFile = path.join(distDir, exe);
        }
      }

      if (!exeFile || !fs.existsSync(exeFile)) {
        throw new Error('Built .exe file not found in dist directory');
      }

      // Upload .exe to GitHub release
      execSync(
        `gh release upload v${version} "${exeFile}" --clobber`,
        { cwd: process.cwd(), env: { ...process.env, GH_TOKEN: ghToken } }
      );

      console.log('Release published successfully with .exe');

      return NextResponse.json({
        success: true,
        message: `✅ Version ${version} released successfully with .exe!`,
        details: {
          version,
          owner,
          repo,
          exeFile: path.basename(exeFile),
          releaseUrl: `https://github.com/${owner}/${repo}/releases/tag/v${version}`,
        },
      });
    } catch (gitError) {
      // Rollback version change if git operations fail
      packageJson.version = packageJson.version; // Keep original
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

      throw new Error(`Release operation failed: ${gitError instanceof Error ? gitError.message : 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Error publishing release:', error);
    return NextResponse.json(
      { message: `Error publishing release: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
