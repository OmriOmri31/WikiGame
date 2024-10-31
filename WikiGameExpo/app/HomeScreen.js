// app/HomeScreen.js

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import usePreventBack from './usePreventBack';

/**
 * HomeScreen - The main screen after the splash screen.
 *
 * Displays a welcome message and a start button to begin the game.
 *
 * @component
 * @returns {JSX.Element} The HomeScreen component.
 */
const HomeScreen = () => {
    usePreventBack(); // Prevent back navigation

    const router = useRouter();

    /**
     * Handles the start button press by navigating to GameScreen.
     */
    const handleStartPress = () => {
        router.push('/GameScreen');
    };

    return (
        <View style={styles.container}>
            <Text style={styles.text}>ברוכים הבאים למשחק הויקיפדיה!</Text>
            <TouchableOpacity style={styles.button} onPress={handleStartPress}>
                <Text style={styles.buttonText}>התחל</Text>
            </TouchableOpacity>
        </View>
    );
};

export default HomeScreen;

/**
 * Styles for HomeScreen
 */
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#ffffff', // Wikipedia white
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
    text: {
        fontSize: 24,
        fontFamily: 'serif',
        color: '#000000',
        marginBottom: 40,
        textAlign: 'center',
    },
    button: {
        backgroundColor: '#3366CC', // Wikipedia blue
        paddingVertical: 15,
        paddingHorizontal: 30,
        borderRadius: 5,
    },
    buttonText: {
        fontSize: 20,
        color: '#ffffff',
        fontFamily: 'serif',
    },
});
