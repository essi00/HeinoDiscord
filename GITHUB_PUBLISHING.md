# Publishing HeinoDiscord On GitHub

The project is ready to publish as a public open-source repository.

Current local repository:

```text
C:\Users\Joachim Csida\OpenCord
```

GitHub repository owner:

```text
essi00
```

## Option A: GitHub CLI

Install GitHub CLI from:

```text
https://cli.github.com/
```

Then run:

```cmd
cd "C:\Users\Joachim Csida\OpenCord"
gh auth login
pnpm heino:publish-github -- -Owner essi00 -Repo HeinoDiscord
```

That creates a public repository and pushes the local `main` branch.

## Option B: Manual GitHub Website

1. Open GitHub.
2. Create a new public repository named `HeinoDiscord`.
3. Do not initialize it with README, license, or gitignore.
4. Run:

```cmd
cd "C:\Users\Joachim Csida\OpenCord"
git push -u origin main
```

The local `origin` remote is already set to:

```text
https://github.com/essi00/HeinoDiscord.git
```

If you choose another repository name, update it with:

```cmd
git remote set-url origin https://github.com/essi00/YOUR_REPO_NAME.git
```

## Publish A Release

Build:

```cmd
pnpm heino:package
```

Upload this file to a new GitHub Release:

```text
release/HeinoDiscord-release.zip
```

Recommended release title:

```text
HeinoDiscord v1.0.0
```

## Host The Plugin Registry

The static registry is:

```text
opencord/cloud/registry.json
```

After pushing to GitHub, users can inspect plugin metadata directly in the repo.
You can also enable GitHub Pages later and point users at this registry file.
