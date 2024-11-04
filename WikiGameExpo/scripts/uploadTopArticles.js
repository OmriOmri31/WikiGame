// scripts/uploadTopArticles.js

const admin = require('firebase-admin');
const topArticles = require('../assets/top_articles.json');

// Load the service account key JSON file
const serviceAccount = require('../firebase-key.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function uploadTopArticles() {
    try {
        await db.collection('topArticles').doc('list').set({
            articles: topArticles,
        });
        console.log('Top articles uploaded successfully.');
    } catch (error) {
        console.error('Error uploading top articles:', error);
    }
}

uploadTopArticles();
