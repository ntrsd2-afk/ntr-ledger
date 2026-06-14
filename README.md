# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
Prerequisites:

Android phone with USB debugging enabled
(Settings → About phone → tap Build number 7× → Developer Options → USB debugging ON)
Android Studio installed (for SDK tools)
Java 17 installed
Steps:


# 1. Install dependencies (if not done already)
npm install

# 2. Plug in your phone via USB, then:
npx expo run:android
Expo will build the app and install it directly on your phone.

Option 2 — Run on Android Emulator
Open Android Studio → Virtual Device Manager → Create Device
Pick a phone (e.g. Pixel 6), API 33+, and start it
Then run:

npx expo run:android
Option 3 — Build a shareable APK via EAS (no local Android Studio needed)

# Install EAS CLI
npm install -g eas-cli

# Log in to your Expo account
eas login

# Build a preview APK (uploads to Expo servers, takes ~10 min)
eas build --profile preview --platform android
This gives you a download link for an .apk you can install on any Android phone.

Before running — check your .env file
Make sure you have a .env file with your Gemini API key:


EXPO_PUBLIC_GEMINI_API_KEY=your_key_here
Copy .env.example to .env and fill it in. Without this, the AI Scan feature won't work (but the rest of the app will).

Recommendation: If you have an Android phone, Option 1 (USB) is the fastest — npx expo run:android handles everything in one command. Option 3 is best if you want to share the app with others without setting up Android Studio.