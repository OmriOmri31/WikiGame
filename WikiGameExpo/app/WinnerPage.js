// app/WinnerPage.js

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import usePreventBack from './usePreventBack';

/**
 * WinnerPage - Displays the time taken to reach the target article.
 *
 * @component
 * @returns {JSX.Element} The WinnerPage component.
 */
const WinnerPage = () => {
    usePreventBack(); // Prevent back navigation

    const params = useLocalSearchParams();
    const { timeTaken } = params;

    // Fallback in case timeTaken is undefined
    const displayTime = timeTaken ? timeTaken : 'לא נמצא זמן';

    console.log(`WinnerPage loaded with timeTaken=${displayTime}`);

    return (
        <View style={styles.container}>
            <Text style={styles.congratsText}>כל הכבוד!</Text>
            <Text style={styles.timeText}>סיימת את המשחק ב-{displayTime} שניות.</Text>
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
    },
});
