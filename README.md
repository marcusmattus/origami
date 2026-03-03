<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/15o3GOUByM7e7C19axbmFpIPfR0fcl1CY

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Product capabilities

- **Origami Copilot tutor**: AI-assisted tutorial generation is available in the Tutorials view.
- **Origami tutorials dataset**: the Tutorials view includes a **Download Tutorials Dataset (.json)** action.
- **Video uploads**: users can add images and videos when creating feed posts.
- **Backend for web + Expo mobile**: Firebase Auth (including Google Sign-In), Firestore, and Storage are already wired and can be reused by an Expo app.
