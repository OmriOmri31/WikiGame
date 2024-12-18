# generate_top_pages.py

import requests
import json
import datetime

def fetch_top_pages(date, project='he.wikipedia', access='all-access'):
    """
    Fetches the top viewed pages for a given date.
    The Wikimedia API returns a maximum of 1000 results per request.
    """
    year, month, day = date.year, date.month, date.day
    url = f'https://wikimedia.org/api/rest_v1/metrics/pageviews/top/{project}/{access}/{year}/{month:02}/{day:02}'
    headers = {
        'User-Agent': 'WikiGameBot/1.0 (your_email@example.com)'
    }
    response = requests.get(url, headers=headers)

    if response.status_code != 200:
        print(f"Error fetching data for {date.strftime('%Y/%m/%d')}: {response.status_code} {response.reason}")
        return None

    try:
        data = response.json()
        articles = data['items'][0]['articles']
        # Exclude special pages (those starting with "Special:", "Main_Page", etc.)
        articles = [article for article in articles if not article['article'].startswith('Special:') and article['article'] != 'Main_Page']
        return articles
    except json.JSONDecodeError:
        print(f"Error decoding JSON for {date.strftime('%Y/%m/%d')}")
        return None
    except KeyError:
        print(f"Unexpected data structure for {date.strftime('%Y/%m/%d')}")
        return None

def get_past_dates(num_days):
    """
    Generates a list of datetime objects for the past 'num_days' days,
    excluding today.
    """
    dates = []
    utc_now = datetime.datetime.utcnow()
    for i in range(num_days):
        date = utc_now - datetime.timedelta(days=i+1)
        dates.append(date)
    return dates

def main():
    top_pages_set = set()
    num_days = 90  # Number of days to look back (approximately last 3 months)

    dates = get_past_dates(num_days)

    for date in dates:
        date_str = date.strftime('%Y/%m/%d')
        print(f'Fetching top pages for {date_str}...')
        articles = fetch_top_pages(date)
        if articles is None:
            continue
        # Get the top 10 articles for the day
        top_10_articles = articles[:10]
        for article in top_10_articles:
            title = article['article']
            if title not in top_pages_set:
                top_pages_set.add(title)

    if len(top_pages_set) == 0:
        print("No pages were fetched. Please check your date settings or API availability.")
    else:
        # Convert the set to a list and sort it for consistency
        top_pages_list = sorted(top_pages_set)
        # Save the top pages to a JSON file
        with open('WikiGameExpo/assets/top_articles.json', 'w', encoding='utf-8') as f:
            json.dump(top_pages_list, f, ensure_ascii=False, indent=4)
        print(f'Successfully saved {len(top_pages_list)} articles to top_articles.json')

if __name__ == '__main__':
    main()
