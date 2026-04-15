"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/SidebarComponent";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function VersionReleasePage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [newVersion, setNewVersion] = useState("");
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  // GitHub config state
  const [githubUsername, setGithubUsername] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [savingGithub, setSavingGithub] = useState(false);
  const [githubMessage, setGithubMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [publishingRelease, setPublishingRelease] = useState(false);
  const [previousVersion, setPreviousVersion] = useState("");
  const [creatingPatch, setCreatingPatch] = useState(false);
  const [patchMessage, setPatchMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [buildProgress, setBuildProgress] = useState<string>("");

  // Load GitHub config on mount
  useEffect(() => {
    // Check developer authorization
    if (process.env.NEXT_PUBLIC_IS_DEVELOPER !== 'true') {
      setIsAuthorized(false);
      return;
    }
    setIsAuthorized(true);

    const loadGithubConfig = async () => {
      try {
        const response = await fetch("/api/github-config/update");
        if (response.ok) {
          const data = await response.json();
          setGithubUsername(data.config.owner || "");
          setGithubRepo(data.config.repo || "");
        }
      } catch (error) {
        console.error("Error loading GitHub config:", error);
      }
    };
    loadGithubConfig();
  }, []);

  const handleCreateVersion = async () => {
    if (!newVersion.trim()) {
      setMessage({ type: "error", text: "Please enter a version number (e.g., 1.0.0)" });
      return;
    }

    // Validate version format (semantic versioning)
    if (!/^\d+\.\d+\.\d+$/.test(newVersion.trim())) {
      setMessage({ type: "error", text: "Version must be in format: X.Y.Z (e.g., 1.0.0)" });
      return;
    }

    if (!githubToken.trim()) {
      setMessage({ type: "error", text: "GitHub token is required to publish a release" });
      return;
    }

    setCreatingVersion(true);
    setMessage(null);
    setBuildProgress("Starting release process...");

    try {
      // Publish release automatically (includes .exe build and upload)
      const response = await fetch("/api/release/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: newVersion.trim(),
          releaseNotes: releaseNotes.trim(),
          ghToken: githubToken.trim(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessage({
          type: "success",
          text: `✅ Version ${newVersion} published successfully with .exe! Release: ${data.details.releaseUrl}`,
        });
        setBuildProgress("");
        setNewVersion("");
        setReleaseNotes("");
      } else {
        const error = await response.json();
        setMessage({
          type: "error",
          text: `Failed to publish release: ${error.message || "Unknown error"}`,
        });
        setBuildProgress("");
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
      setBuildProgress("");
    } finally {
      setCreatingVersion(false);
    }
  };

  const handleSaveGithubConfig = async () => {
    if (!githubUsername.trim() || !githubRepo.trim()) {
      setGithubMessage({ type: "error", text: "Please enter both GitHub username and repository name" });
      return;
    }

    setSavingGithub(true);
    setGithubMessage(null);

    try {
      const response = await fetch("/api/github-config/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: githubUsername.trim(),
          repo: githubRepo.trim(),
        }),
      });

      if (response.ok) {
        setGithubMessage({
          type: "success",
          text: `✅ GitHub configuration saved: ${githubUsername}/${githubRepo}`,
        });
      } else {
        const error = await response.json();
        setGithubMessage({
          type: "error",
          text: `Failed to save configuration: ${error.message || "Unknown error"}`,
        });
      }
    } catch (error) {
      setGithubMessage({
        type: "error",
        text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } finally {
      setSavingGithub(false);
    }
  };

  const handleCreatePatch = async () => {
    if (!previousVersion.trim()) {
      setPatchMessage({ type: "error", text: "Please enter the previous version number" });
      return;
    }

    if (!newVersion.trim()) {
      setPatchMessage({ type: "error", text: "Please enter the current version number" });
      return;
    }

    if (!/^\d+\.\d+\.\d+$/.test(previousVersion.trim())) {
      setPatchMessage({ type: "error", text: "Previous version must be in format: X.Y.Z" });
      return;
    }

    if (!/^\d+\.\d+\.\d+$/.test(newVersion.trim())) {
      setPatchMessage({ type: "error", text: "Current version must be in format: X.Y.Z" });
      return;
    }

    if (!githubToken.trim()) {
      setPatchMessage({ type: "error", text: "GitHub token is required to create a patch" });
      return;
    }

    setCreatingPatch(true);
    setPatchMessage(null);

    try {
      const response = await fetch("/api/release/create-patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previousVersion: previousVersion.trim(),
          currentVersion: newVersion.trim(),
          ghToken: githubToken.trim(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setPatchMessage({
          type: "success",
          text: `✅ Patch created and uploaded! File: ${data.details.patchFile} (${data.details.fileSize}) - ${data.details.changedFiles} files changed`,
        });
        setPreviousVersion("");
      } else {
        const error = await response.json();
        setPatchMessage({
          type: "error",
          text: `Failed to create patch: ${error.message || "Unknown error"}`,
        });
      }
    } catch (error) {
      setPatchMessage({
        type: "error",
        text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } finally {
      setCreatingPatch(false);
    }
  };

  if (isAuthorized === false) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Card className="p-8 text-center max-w-md">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-6">
            This module is restricted to developers only. If you believe this is an error, please contact the system administrator.
          </p>
          <Button onClick={() => window.location.href = '/'} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            Return to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  if (isAuthorized === null) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar collapsed={sidebarCollapsed} onToggle={setSidebarCollapsed} />

      <main className="flex-1 overflow-auto ml-64">
        <div className="p-8 max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Version Release</h1>
            <p className="text-gray-600">Create and publish a new app version for distribution</p>
          </div>

          <div className="space-y-6">
            {/* GitHub Configuration */}
            <Card className="p-6 border-purple-200 bg-purple-50">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">GitHub Configuration</h2>
              <p className="text-sm text-gray-600 mb-4">Configure your GitHub repository and token for automatic releases</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    GitHub Username
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., your-github-username"
                    value={githubUsername}
                    onChange={(e) => setGithubUsername(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Repository Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., homeopms"
                    value={githubRepo}
                    onChange={(e) => setGithubRepo(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    GitHub Personal Access Token
                  </label>
                  <input
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Create at: GitHub Settings → Developer settings → Personal access tokens (repo scope)
                  </p>
                </div>

                <Button
                  onClick={handleSaveGithubConfig}
                  disabled={savingGithub}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium"
                >
                  {savingGithub ? "Saving..." : "Save GitHub Configuration"}
                </Button>
              </div>
            </Card>

            {/* GitHub Config Status Message */}
            {githubMessage && (
              <Card className={`p-4 ${githubMessage.type === "success" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                <p className={githubMessage.type === "success" ? "text-green-700" : "text-red-700"}>
                  {githubMessage.text}
                </p>
              </Card>
            )}

            {/* Version Creation Form */}
            <Card className="p-6 border-blue-200 bg-blue-50">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Create & Publish New Version</h2>
              <p className="text-sm text-gray-600 mb-4">This will automatically commit, push, and create a GitHub release</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Version Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., 1.0.0"
                    value={newVersion}
                    onChange={(e) => setNewVersion(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Format: X.Y.Z (e.g., 1.0.0)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Release Notes (Optional)
                  </label>
                  <textarea
                    placeholder="Describe what's new in this version..."
                    value={releaseNotes}
                    onChange={(e) => setReleaseNotes(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <Button
                  onClick={handleCreateVersion}
                  disabled={creatingVersion}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium"
                >
                  {creatingVersion ? "Publishing..." : "Create & Publish Version"}
                </Button>

                {buildProgress && (
                  <div className="mt-4 p-4 bg-blue-100 border border-blue-300 rounded-lg">
                    <p className="text-sm text-blue-700 font-medium">{buildProgress}</p>
                    <p className="text-xs text-blue-600 mt-2">This may take 5-10 minutes while building the .exe file...</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Status Message */}
            {message && (
              <Card className={`p-4 ${message.type === "success" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                <p className={message.type === "success" ? "text-green-700" : "text-red-700"}>
                  {message.text}
                </p>
              </Card>
            )}

            {/* Create Patch Section */}
            <Card className="p-6 border-orange-200 bg-orange-50">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Create & Upload Patch (Optional)</h2>
              <p className="text-sm text-gray-600 mb-4">Create a patch file for users to download instead of full .exe. Patches are much smaller (5-50 MB vs 200+ MB)</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Previous Version
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., 1.0.0"
                    value={previousVersion}
                    onChange={(e) => setPreviousVersion(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">The version you're upgrading FROM</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Current Version
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., 1.0.1"
                    value={newVersion}
                    onChange={(e) => setNewVersion(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">The version you're upgrading TO (must match the version above)</p>
                </div>

                <Button
                  onClick={handleCreatePatch}
                  disabled={creatingPatch}
                  className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg font-medium"
                >
                  {creatingPatch ? "Creating Patch..." : "Create & Upload Patch"}
                </Button>
              </div>
            </Card>

            {/* Patch Status Message */}
            {patchMessage && (
              <Card className={`p-4 ${patchMessage.type === "success" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                <p className={patchMessage.type === "success" ? "text-green-700" : "text-red-700"}>
                  {patchMessage.text}
                </p>
              </Card>
            )}

            {/* Next Steps */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Automatic Release Process</h2>
              <p className="text-sm text-gray-600 mb-4">When you click "Create & Publish Version", the system will:</p>
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                <li>Update version in package.json</li>
                <li>Commit changes to Git</li>
                <li>Push to GitHub</li>
                <li>Create a GitHub release</li>
                <li>Build .exe file automatically (5-10 minutes)</li>
                <li>Upload .exe to GitHub release</li>
                <li>Users will be notified automatically</li>
              </ol>
            </Card>

            {/* GitHub Setup Guide */}
            <Card className="p-6 border-green-200 bg-green-50">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">GitHub Setup (One-Time)</h2>
              <div className="space-y-3 text-sm text-gray-700">
                <p className="font-medium">Follow these steps once to enable automatic updates:</p>
                <ol className="list-decimal list-inside space-y-2 ml-2">
                  <li>Create a GitHub repository for your project</li>
                  <li>Push your code to GitHub</li>
                  <li>
                    Generate a personal access token:
                    <ul className="list-disc list-inside ml-4 mt-1">
                      <li>Go to GitHub Settings → Developer settings → Personal access tokens</li>
                      <li>Create a new token with "repo" scope</li>
                    </ul>
                  </li>
                  <li>Enter your GitHub username, repository name, and token in the configuration section above</li>
                  <li>Click "Save GitHub Configuration"</li>
                  <li>Enter a version number and click "Create & Publish Version"</li>
                  <li>The system will automatically build and upload the .exe file</li>
                </ol>
              </div>
            </Card>

            {/* Important Notes */}
            <Card className="p-6 border-amber-200 bg-amber-50">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Important Notes</h2>
              <ul className="list-disc list-inside space-y-2 text-sm text-gray-700">
                <li>Version numbers must follow semantic versioning (X.Y.Z)</li>
                <li>Each version should be unique and higher than the previous one</li>
                <li>Users will be notified automatically when a new version is available</li>
                <li>All user data is preserved during updates</li>
                <li>Updates are downloaded in the background and installed on restart</li>
              </ul>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
