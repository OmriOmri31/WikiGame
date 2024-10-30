// app/screens/HomeScreen.js

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * HomeScreen - The main screen after the splash screen.
 *
 * @component
 * @returns {JSX.Element} The HomeScreen component.
 */
const HomeScreen = () => {
    return (
        <View style={styles.container}>
            <Text style={styles.text}>Welcome to משחק הויקיפדיה!</Text>
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
        backgroundColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        fontSize: 24,
        fontFamily: 'serif',
        color: '#000000',
    },
});
