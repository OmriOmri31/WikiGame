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
     * JavaScript code to remove the search bar and toolbar from the Wikipedia page.
     */
    const injectedJavaScript = `
    (function() {
      // Hide the search form
      var searchForm = document.querySelector('.minerva-search-form');
      if (searchForm) {
        searchForm.style.display = 'none';
      }

      // Hide the toolbar
      var toolbar = document.querySelector('.menu');
      if (toolbar) {
        toolbar.style.display = 'none';
      }

      // Prevent the search input from being focusable
      var searchInput = document.getElementById('searchInput');
      if (searchInput) {
        searchInput.setAttribute('readonly', 'true');
      }

      // Disable all links that lead to the search page
      var searchLinks = document.querySelectorAll('a[href*="/w/index.php?search="], a[href*="/wiki/מיוחד:חיפוש"]');
      searchLinks.forEach(function(link) {
        link.href = 'javascript:void(0);';
      });
    })();
  `;

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
                    sandbox="allow-scripts allow-same-origin"
                    onLoad={() => {
                        const iframe = webViewRef.current;
                        if (iframe) {
                            // Inject JavaScript into the iframe
                            iframe.contentWindow.eval(injectedJavaScript);
                        }
                    }}
                />
            ) : (
                // For native platforms, use react-native-webview
                <WebView
                    source={{ uri: articleUrl }}
                    injectedJavaScript={injectedJavaScript}
                    javaScriptEnabled={true}
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
        marginVertical: 30, // As per your updated styles
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
