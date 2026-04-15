import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
// @ts-ignore - archiver doesn't have types
import archiver from 'archiver';

/**
 * Create patch file from git diff between two versions
 * POST /api/release/create-patch
 * Body: { previousVersion: "0.1.0", currentVersion: "0.1.1", ghToken: "..." }
 */
export async function POST(request: NextRequest) {
  try {
    const { previousVersion, currentVersion, ghToken } = await request.json();

    if (!previousVersion || !currentVersion || !ghToken) {
      return NextResponse.json(
        { message: 'previousVersion, currentVersion, and ghToken are required' },
        { status: 400 }
      );
    }

    // Validate version format
    if (!/^\d+\.\d+\.\d+$/.test(previousVersion) || !/^\d+\.\d+\.\d+$/.test(currentVersion)) {
      return NextResponse.json(
        { message: 'Versions must be in format: X.Y.Z' },
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
        { message: 'GitHub configuration not found in package.json' },
        { status: 400 }
      );
    }

    console.log(`Creating patch from v${previousVersion} to v${currentVersion}...`);

    // Ensure dist/patches directory exists
    const patchDir = path.join(process.cwd(), 'dist', 'patches');
    if (!fs.existsSync(patchDir)) {
      fs.mkdirSync(patchDir, { recursive: true });
    }

    // Get list of changed files between versions
    let changedFiles: string[] = [];
    try {
      const diffOutput = execSync(
        `git diff --name-only v${previousVersion} v${currentVersion}`,
        { encoding: 'utf-8', cwd: process.cwd() }
      );
      changedFiles = diffOutput
        .split('\n')
        .filter(f => f.trim() && !f.startsWith('.'))
        .filter(f => {
          // Exclude build artifacts and node_modules
          return !f.includes('node_modules') &&
                 !f.includes('dist-electron') &&
                 !f.includes('.next') &&
                 !f.includes('.git');
        });
    } catch (error) {
      return NextResponse.json(
        { message: `Failed to get git diff: ${error instanceof Error ? error.message : 'Unknown error'}` },
        { status: 400 }
      );
    }

    if (changedFiles.length === 0) {
      return NextResponse.json(
        { message: 'No changed files found between versions' },
        { status: 400 }
      );
    }

    console.log(`Found ${changedFiles.length} changed files`);

    // Create zip archive
    const patchFile = path.join(patchDir, `app-${currentVersion}-patch.zip`);
    const output = fs.createWriteStream(patchFile);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve) => {
      output.on('close', async () => {
        const fileSize = (archive.pointer() / 1024 / 1024).toFixed(2);
        console.log(`Patch created: ${patchFile} (${fileSize} MB)`);

        // Upload patch to GitHub release
        try {
          console.log('Uploading patch to GitHub release...');
          process.env.GH_TOKEN = ghToken;

          execSync(
            `gh release upload v${currentVersion} "${patchFile}" --clobber`,
            { cwd: process.cwd(), env: { ...process.env, GH_TOKEN: ghToken } }
          );

          console.log('Patch uploaded successfully');

          resolve(NextResponse.json({
            success: true,
            message: `✅ Patch created and uploaded successfully!`,
            details: {
              patchFile: `app-${currentVersion}-patch.zip`,
              fileSize: `${fileSize} MB`,
              changedFiles: changedFiles.length,
              releaseUrl: `https://github.com/${owner}/${repo}/releases/tag/v${currentVersion}`,
            },
          }));
        } catch (uploadError) {
          console.error('Failed to upload patch:', uploadError);
          resolve(NextResponse.json(
            {
              success: false,
              message: 'Patch created but failed to upload to GitHub',
              details: {
                patchFile: `app-${currentVersion}-patch.zip`,
                fileSize: `${fileSize} MB`,
                changedFiles: changedFiles.length,
                error: uploadError instanceof Error ? uploadError.message : 'Unknown error',
              },
            },
            { status: 500 }
          ));
        }
      });

      archive.on('error', (err: Error) => {
        console.error('Archive error:', err);
        resolve(NextResponse.json(
          { message: `Failed to create patch: ${err.message}` },
          { status: 500 }
        ));
      });

      archive.pipe(output);

      // Add changed files to archive
      changedFiles.forEach(file => {
        const filePath = path.join(process.cwd(), file);
        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: file });
        }
      });

      archive.finalize();
    });
  } catch (error) {
    console.error('Error creating patch:', error);
    return NextResponse.json(
      { message: `Error creating patch: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
