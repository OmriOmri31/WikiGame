// app/RandomArticleScreen.js

import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * RandomArticleScreen - Displays a random Hebrew Wikipedia article.
 * Handles both web and native platforms.
 *
 * @component
 * @returns {JSX.Element} The RandomArticleScreen component.
 */
const RandomArticleScreen = () => {
    const [articleUrl, setArticleUrl] = useState(null);

    useEffect(() => {
        /**
         * Fetches a random Hebrew Wikipedia article URL.
         */
        const fetchRandomArticle = async () => {
            try {
                const response = await fetch(
                    'https://he.wikipedia.org/w/api.php?action=query&format=json&list=random&rnnamespace=0&rnlimit=1&origin=*'
                );
                const data = await response.json();
                const title = data.query.random[0].title;
                const url = `https://he.wikipedia.org/wiki/${encodeURIComponent(title)}`;
                setArticleUrl(url);
            } catch (error) {
                console.error('Error fetching random article:', error);
            }
        };

        fetchRandomArticle();
    }, []);

    if (!articleUrl) {
        // Show a loading indicator while fetching the article URL
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3366CC" />
            </View>
        );
    }

    if (Platform.OS === 'web') {
        // For web platform, use iframe
        return (
            <View style={styles.container}>
                <iframe
                    src={articleUrl}
                    style={styles.webview}
                    title="Random Wikipedia Article"
                />
            </View>
        );
    } else {
        // For native platforms, use react-native-webview
        return (
            <WebView
                source={{ uri: articleUrl }}
                startInLoadingState
                renderLoading={() => (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#3366CC" />
                    </View>
                )}
            />
        );
    }
};

export default RandomArticleScreen;

/**
 * Styles for RandomArticleScreen
 */
const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    webview: {
        flex: 1,
        width: '100%',
        height: '100%',
        borderWidth: 0,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
