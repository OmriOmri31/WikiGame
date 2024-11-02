// app/HomeScreen.js

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import usePreventBack from './usePreventBack';

/**
 * HomeScreen - The main screen after the splash screen.
 *
 * Displays a welcome message, asks for the player's name, and has a start button to begin the game.
 *
 * @component
 * @returns {JSX.Element} The HomeScreen component.
 */
const HomeScreen = () => {
    usePreventBack(); // Prevent back navigation

    const router = useRouter();
    const [playerName, setPlayerName] = useState('');

    /**
     * Handles the start button press by navigating to GameScreen.
     */
    const handleStartPress = () => {
        if (playerName.trim() === '') {
            Alert.alert('שגיאה', 'אנא הכנס את שמך לפני תחילת המשחק.');
            return;
        }
        // Pass the player's name to GameScreen
        router.push({
            pathname: '/GameScreen',
            params: { playerName },
        });
    };

    return (
        <View style={styles.container}>
            <Text style={styles.text}>ברוכים הבאים למשחק הוויקיפדיה!</Text>
            <TextInput
                style={styles.input}
                value={playerName}
                onChangeText={setPlayerName}
                placeholder="הכנס את שמך"
                placeholderTextColor="#aaaaaa"
            />
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
    input: {
        height: 40,
        borderColor: '#cccccc',
        borderWidth: 1,
        width: '80%',
        paddingHorizontal: 10,
        marginBottom: 20,
        textAlign: 'center',
        fontSize: 18,
        color: '#000000',
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
