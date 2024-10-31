// app/TargetArticleScreen.js

import React, { useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Platform,
    SafeAreaView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useLocalSearchParams, useRouter } from 'expo-router';
import usePreventBack from './usePreventBack';

/**
 * TargetArticleScreen - Displays the target article with a back button to WinnerPage.
 *
 * @component
 * @returns {JSX.Element} The TargetArticleScreen component.
 */
const TargetArticleScreen = () => {
    usePreventBack(); // Prevent back navigation

    const router = useRouter();
    const params = useLocalSearchParams();
    const { targetArticleTitle, targetArticleUrl, timeTaken } = params;

    // Fallbacks for undefined parameters
    const articleTitle = targetArticleTitle || 'המאמר המטרה';
    const articleUrl = targetArticleUrl || '';
    const displayTime = timeTaken || 'לא נמצא זמן';

    const webViewRef = useRef(null);

    /**
     * Handles the press of the "Back to Winner Page" button.
     */
    const handleBackToWinnerPage = () => {
        // Navigate back to WinnerPage with time taken and target article info
        router.push(
            `/WinnerPage?timeTaken=${encodeURIComponent(displayTime)}&targetArticleTitle=${encodeURIComponent(
                articleTitle
            )}&targetArticleUrl=${encodeURIComponent(articleUrl)}`
        );
    };

    if (!articleUrl) {
        // Show a loading indicator if URL is not available
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3366CC" />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.articleTitle}>{articleTitle}</Text>
                <TouchableOpacity style={styles.button} onPress={handleBackToWinnerPage}>
                    <Text style={styles.buttonText}>חזור לעמוד הניצחון</Text>
                </TouchableOpacity>
            </View>
            {Platform.OS === 'web' ? (
                // For web platform, use iframe
                <iframe
                    ref={webViewRef}
                    src={articleUrl}
                    style={styles.webview}
                    title="Target Article"
                    sandbox="allow-same-origin allow-scripts"
                />
            ) : (
                // For native platforms, use react-native-webview
                <WebView
                    source={{ uri: articleUrl }}
                    startInLoadingState
                    renderLoading={() => (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#3366CC" />
                        </View>
                    )}
                />
            )}
        </SafeAreaView>
    );
};

export default TargetArticleScreen;

/**
 * Styles for TargetArticleScreen
 */
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#ffffff',
    },
    header: {
        alignItems: 'center',
        marginVertical: 30,
    },
    articleTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#000000',
        marginBottom: 10,
    },
    button: {
        backgroundColor: '#3366CC',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 5,
        marginBottom: 10,
    },
    buttonText: {
        fontSize: 16,
        color: '#ffffff',
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
