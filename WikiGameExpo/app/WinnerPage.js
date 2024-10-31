// app/WinnerPage.js

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import usePreventBack from './usePreventBack';

/**
 * WinnerPage - Displays the time taken to reach the target article.
 *
 * @component
 * @returns {JSX.Element} The WinnerPage component.
 */
const WinnerPage = () => {
    usePreventBack(); // Prevent back navigation

    const router = useRouter();
    const params = useLocalSearchParams();
    const { timeTaken, targetArticleTitle, targetArticleUrl } = params;

    // Fallbacks in case parameters are undefined
    const displayTime = timeTaken || 'לא נמצא זמן';
    const articleTitle = targetArticleTitle || 'המאמר המטרה';
    const articleUrl = targetArticleUrl || '';

    console.log(`WinnerPage loaded with timeTaken=${displayTime}`);

    /**
     * Handles the press of the "Return to Target Article" button.
     */
    const handleReturnToArticle = () => {
        // Navigate to TargetArticleScreen with the target article info
        router.push(
            `/TargetArticleScreen?targetArticleTitle=${encodeURIComponent(
                articleTitle
            )}&targetArticleUrl=${encodeURIComponent(articleUrl)}&timeTaken=${encodeURIComponent(displayTime)}`
        );
    };

    return (
        <View style={styles.container}>
            <Text style={styles.congratsText}>כל הכבוד!</Text>
            <Text style={styles.timeText}>סיימת את המשחק ב-{displayTime} שניות.</Text>
            <TouchableOpacity style={styles.button} onPress={handleReturnToArticle}>
                <Text style={styles.buttonText}>חזור ל{articleTitle}</Text>
            </TouchableOpacity>
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
        marginBottom: 40,
    },
    button: {
        backgroundColor: '#3366CC',
        paddingVertical: 15,
        paddingHorizontal: 30,
        borderRadius: 5,
    },
    buttonText: {
        fontSize: 20,
        color: '#ffffff',
    },
});
