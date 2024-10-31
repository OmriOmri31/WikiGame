// app/ArticleView.js

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, useWindowDimensions } from 'react-native';
import RenderHTML from 'react-native-render-html';
import PropTypes from 'prop-types';

/**
 * ArticleView - Component to display Wikipedia article content.
 *
 * @component
 * @param {object} props - Component props.
 * @param {string} props.articleTitle - The title of the article to display.
 * @param {function} props.onLinkPress - Callback function when a link is pressed.
 * @returns {JSX.Element} The ArticleView component.
 */
const ArticleView = ({ articleTitle, onLinkPress }) => {
    const [articleContent, setArticleContent] = useState(null);
    const { width } = useWindowDimensions();

    useEffect(() => {
        /**
         * Fetches the HTML content of a Wikipedia article.
         *
         * @async
         * @param {string} title - The title of the article.
         */
        const fetchArticleContent = async (title) => {
            try {
                const response = await fetch(
                    `https://he.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(
                        title
                    )}&format=json&origin=*&prop=text`
                );
                const data = await response.json();
                setArticleContent(data.parse.text['*']);
            } catch (error) {
                console.error('Error fetching article content:', error);
            }
        };

        fetchArticleContent(articleTitle);
    }, [articleTitle]);

    if (!articleContent) {
        // Show a loading indicator while fetching the article content
        return (
            <ActivityIndicator
                size="large"
                color="#3366CC"
                style={styles.loadingIndicator}
            />
        );
    }

    /**
     * Handles link press events within the article content.
     *
     * @param {object} event - The event object.
     * @param {string} href - The href attribute of the link.
     */
    const handleLinkPress = (event, href) => {
        // Extract the article title from the href
        const titleMatch = href.match(/\/wiki\/(.+)/);
        if (titleMatch && titleMatch[1]) {
            const newTitle = decodeURIComponent(titleMatch[1]);
            onLinkPress(newTitle);
        }
    };

    return (
        <RenderHTML
            contentWidth={width}
            source={{ html: articleContent }}
            baseStyle={styles.baseStyle}
            tagsStyles={tagsStyles}
            onLinkPress={handleLinkPress}
        />
    );
};

ArticleView.propTypes = {
    articleTitle: PropTypes.string.isRequired,
    onLinkPress: PropTypes.func.isRequired,
};

export default ArticleView;

/**
 * Styles for ArticleView
 */
const styles = StyleSheet.create({
    loadingIndicator: {
        flex: 1,
        justifyContent: 'center',
    },
    baseStyle: {
        color: '#000000',
        backgroundColor: '#ffffff',
    },
});

/**
 * Custom styles for HTML tags
 */
const tagsStyles = {
    a: {
        color: '#3366CC', // Wikipedia link color
    },
    p: {
        marginVertical: 5,
    },
};
