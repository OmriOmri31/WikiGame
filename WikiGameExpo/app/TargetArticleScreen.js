// app/TargetArticleScreen.js

import React, { useRef, useState, useEffect } from 'react';
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
 * TargetArticleScreen - Displays the target article with a custom header and a back button to WinnerPage.
 *
 * The screen hides the Wikipedia search bar and toolbar to prevent cheating.
 * It also tracks the number of pages the user has visited during the game.
 *
 * @component
 * @returns {JSX.Element} The TargetArticleScreen component.
 */
const TargetArticleScreen = () => {
    usePreventBack(); // Prevent back navigation

    const router = useRouter();
    const params = useLocalSearchParams();

    // Extract parameters passed from WinnerPage
    const { targetArticleTitle, targetArticleUrl, timeTaken, pageVisitCount } = params;

    // Fallbacks in case parameters are undefined
    const articleTitle = targetArticleTitle || 'המאמר המטרה';
    const articleUrl = targetArticleUrl || '';
    const displayTime = timeTaken || 'לא נמצא זמן';
    const initialPageVisitCount = parseInt(pageVisitCount, 10) || 1;

    // State to manage the number of pages visited
    const [currentPageVisitCount, setCurrentPageVisitCount] = useState(initialPageVisitCount);

    const webViewRef = useRef(null);
    const intervalRef = useRef(null);

    /**
     * JavaScript code to hide the search bar and toolbar immediately before content loads.
     * This prevents the search bar and toolbar from appearing even briefly.
     */
    const injectedJavaScriptBeforeContentLoaded = `
        (function() {
            var style = document.createElement('style');
            style.innerHTML = \`
                /* Hide the search form and toolbar */
                .minerva-search-form, .menu, .minerva-user-navigation, .page-actions-menu { 
                    display: none !important; 
                }
                /* Adjust the main content margin to occupy the space */
                #content, .mw-body { 
                    margin-top: 0 !important; 
                }
            \`;
            document.head.appendChild(style);
        })();
    `;

    /**
     * JavaScript code to track link clicks within the WebView.
     * It increments the page visit counter each time a link is clicked.
     */
    const injectedJavaScript = `
        (function() {
            document.querySelectorAll('a').forEach(function(link) {
                link.addEventListener('click', function() {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pageVisited' }));
                });
            });
        })();
    `;

    /**
     * Handles messages sent from the WebView.
     * Specifically, it listens for page visit events to increment the counter.
     *
     * @param {object} event - The event object containing the message.
     */
    const handleWebViewMessage = (event) => {
        try {
            const message = JSON.parse(event.nativeEvent.data);
            if (message.type === 'pageVisited') {
                setCurrentPageVisitCount((prevCount) => prevCount + 1);
            }
        } catch (error) {
            console.error('Error parsing message from WebView:', error);
        }
    };

    /**
     * Handles navigation state changes in the WebView to detect when the target article is reached.
     *
     * @param {object} navState - The navigation state of the WebView.
     */
    const handleNavigationChange = (navState) => {
        const { url } = navState;

        // Decode URLs for accurate comparison
        const currentUrlDecoded = decodeURIComponent(url);
        const targetUrlDecoded = decodeURIComponent(articleUrl);

        // Extract the article title from the current URL
        const currentTitleMatch = currentUrlDecoded.match(/wiki\/([^#?]+)/);
        const currentTitle = currentTitleMatch ? currentTitleMatch[1] : '';

        // Extract the article title from the target URL
        const targetTitleMatch = targetUrlDecoded.match(/wiki\/([^#?]+)/);
        const targetTitleExtracted = targetTitleMatch ? targetTitleMatch[1] : '';

        // Normalize titles by replacing underscores with spaces
        const normalizedCurrentTitle = currentTitle.replace(/_/g, ' ').trim();
        const normalizedTargetTitle = targetTitleExtracted.replace(/_/g, ' ').trim();

        // Log the normalized current and target titles for debugging
        console.log('Normalized Current Article:', normalizedCurrentTitle);
        console.log('Normalized Target Article:', normalizedTargetTitle);

        // Compare titles
        if (normalizedCurrentTitle === normalizedTargetTitle) {
            console.log('User reached the target article.');

            const finalTimeTaken = displayTime;
            const finalPageVisitCount = currentPageVisitCount;

            console.log(`Navigating to WinnerPage with timeTaken=${finalTimeTaken} and pageVisitCount=${finalPageVisitCount}`);

            // Navigate to WinnerPage with time taken, target article info, and page visit count
            router.replace(
                `/WinnerPage?timeTaken=${encodeURIComponent(
                    String(finalTimeTaken)
                )}&targetArticleTitle=${encodeURIComponent(
                    articleTitle
                )}&targetArticleUrl=${encodeURIComponent(
                    articleUrl
                )}&pageVisitCount=${encodeURIComponent(
                    String(finalPageVisitCount)
                )}`
            );
        }
    };

    /**
     * Handles the press of the "חזור לעמוד הניצחון" (Back to Winner Page) button.
     */
    const handleBackToWinnerPage = () => {
        // Navigate back to WinnerPage with time taken, target article info, and page visit count
        router.push(
            `/WinnerPage?timeTaken=${encodeURIComponent(
                String(displayTime)
            )}&targetArticleTitle=${encodeURIComponent(
                articleTitle
            )}&targetArticleUrl=${encodeURIComponent(
                articleUrl
            )}&pageVisitCount=${encodeURIComponent(
                String(currentPageVisitCount)
            )}`
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
            {/* Custom Header */}
            <View style={styles.header}>
                <Text style={styles.navigationText}>
                    דף התחלה &#8592; דף מטרה
                </Text>
                <Text style={styles.counterText}>
                    מספר הדפים: {currentPageVisitCount}
                </Text>
                <TouchableOpacity style={styles.backButton} onPress={handleBackToWinnerPage}>
                    <Text style={styles.backButtonText}>חזור לעמוד הניצחון</Text>
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
                            try {
                                // Inject CSS to hide search bar and toolbar immediately
                                iframe.contentWindow.eval(injectedJavaScriptBeforeContentLoaded);

                                // Inject JavaScript to track link clicks
                                iframe.contentWindow.eval(injectedJavaScript);
                            } catch (error) {
                                console.error('Error injecting scripts into iframe:', error);
                            }
                        }
                    }}
                />
            ) : (
                // For native platforms, use react-native-webview
                <WebView
                    source={{ uri: articleUrl }}
                    ref={webViewRef}
                    onNavigationStateChange={handleNavigationChange}
                    injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded}
                    injectedJavaScript={injectedJavaScript}
                    javaScriptEnabled={true}
                    onMessage={handleWebViewMessage}
                    startInLoadingState
                    renderLoading={() => (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#3366CC" />
                        </View>
                    )}
                    style={styles.webview}
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
        position: 'absolute',
        top: 0,
        width: '100%',
        backgroundColor: '#ffffff',
        alignItems: 'center',
        paddingVertical: 35, // Adjusted as per GameScreen.js
        zIndex: 1, // Ensure the header is above the WebView
        borderBottomWidth: 1,
        borderBottomColor: '#dddddd',
    },
    navigationText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#000000',
    },
    counterText: {
        fontSize: 14,
        color: '#000000',
        marginTop: 5,
    },
    backButton: {
        marginTop: 10,
        backgroundColor: '#3366CC',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 5,
    },
    backButtonText: {
        fontSize: 16,
        color: '#ffffff',
    },
    webview: {
        flex: 1,
        marginTop: 100, // Adjusted to prevent content from being hidden behind the header
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
