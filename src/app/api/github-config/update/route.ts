import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { owner, repo, token } = await request.json();

    if (!owner || !repo) {
      return NextResponse.json(
        { message: 'GitHub username and repository name are required' },
        { status: 400 }
      );
    }

    // Read package.json
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    // Update the publish configuration
    if (!packageJson.build) {
      packageJson.build = {};
    }
    if (!packageJson.build.publish) {
      packageJson.build.publish = {};
    }

    packageJson.build.publish.provider = 'github';
    packageJson.build.publish.owner = owner;
    packageJson.build.publish.repo = repo;

    // Write back to package.json
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    // Store token in environment if provided
    if (token) {
      process.env.GH_TOKEN = token;
    }

    return NextResponse.json({
      success: true,
      message: `GitHub configuration updated: ${owner}/${repo}`,
      config: {
        owner,
        repo,
        tokenSet: !!token,
      },
    });
  } catch (error) {
    console.error('Error updating GitHub config:', error);
    return NextResponse.json(
      { message: `Error updating configuration: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    const config = packageJson.build?.publish || {
      provider: 'github',
      owner: 'your-github-username',
      repo: 'your-repo-name',
    };

    return NextResponse.json({
      success: true,
      config,
    });
  } catch (error) {
    console.error('Error reading GitHub config:', error);
    return NextResponse.json(
      { message: 'Error reading configuration' },
      { status: 500 }
    );
  }
}
