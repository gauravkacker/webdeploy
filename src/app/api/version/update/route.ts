import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(request: Request) {
  try {
    const { version } = await request.json();

    if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
      return NextResponse.json(
        { success: false, error: "Invalid version format" },
        { status: 400 }
      );
    }

    // Path to package.json in the project root
    const packageJsonPath = path.resolve(process.cwd(), "package.json");

    if (!fs.existsSync(packageJsonPath)) {
      return NextResponse.json(
        { success: false, error: "package.json not found" },
        { status: 404 }
      );
    }

    // Read and update package.json
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    packageJson.version = version;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    return NextResponse.json({
      success: true,
      message: `Version updated to ${version} in package.json`,
    });
  } catch (error) {
    console.error("Error updating version:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
