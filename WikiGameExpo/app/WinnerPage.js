// app/WinnerPage.js

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import usePreventBack from './usePreventBack';

// Import Firebase Firestore functions
import { db } from '../firebaseConfig';
import { collection, addDoc, Timestamp } from 'firebase/firestore';

/**
 * WinnerPage - Displays the time taken and pages visited to reach the target article.
 * Stores the player's score and navigates to the leaderboard after 2 seconds.
 *
 * @component
 * @returns {JSX.Element} The WinnerPage component.
 */
const WinnerPage = () => {
    usePreventBack(); // Prevent back navigation

    const router = useRouter();
    const params = useLocalSearchParams();
    const { timeTaken, targetArticleTitle, targetArticleUrl, pageVisitCount, playerName } = params;

    // Fallbacks in case parameters are undefined
    const displayTime = parseFloat(timeTaken) || 0;
    const articleTitle = targetArticleTitle || 'המאמר המטרה';
    const articleUrl = targetArticleUrl || '';
    const visits = parseInt(pageVisitCount, 10) || 0;
    const name = playerName || 'שחקן';

    console.log(`WinnerPage loaded with timeTaken=${displayTime}`);

    useEffect(() => {
        // Store the player's score
        const storeScore = async () => {
            try {
                await addDoc(collection(db, 'scores'), {
                    name: name,
                    pagesVisited: visits,
                    timeTaken: displayTime,
                    timestamp: Timestamp.now(),
                });
                console.log('Score saved successfully.');
            } catch (error) {
                console.error('Error adding document: ', error);
                Alert.alert('שגיאה', 'התרחשה שגיאה בשמירת הציון.');
            }
        };

        storeScore();

        // Navigate to the Leaderboard after 2 seconds
        const timer = setTimeout(() => {
            router.replace({
                pathname: '/Leaderboard',
                params: { playerName: name },
            });
        }, 2000);

        return () => clearTimeout(timer);
    }, []);

    return (
        <View style={styles.container}>
            <Text style={styles.congratsText}>כל הכבוד!</Text>
            <Text style={styles.timeText}>
                סיימת את המשחק ב-{displayTime} שניות.
            </Text>
            <Text style={styles.visitsText}>מספר הדפים שביקרת: {visits}</Text>
        </View>
    );
};

export default WinnerPage;

/**
 * Styles for WinnerPage
 */
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
    congratsText: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#000000',
        marginBottom: 20,
        textAlign: 'center',
    },
    timeText: {
        fontSize: 24,
        color: '#000000',
        textAlign: 'center',
        marginBottom: 10,
    },
    visitsText: {
        fontSize: 24,
        color: '#000000',
        textAlign: 'center',
    },
});
