# RescueTime Daily Report Generator

A TypeScript script that generates a daily summary report of your RescueTime data.

## Features

- Fetches your daily summary data from RescueTime
- Displays total hours tracked and productivity pulse
- Shows time distribution across productivity categories
- Lists your top activities for the day
- Saves the report as a Markdown file
- Supports generating reports for an entire month at once

## Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Get your RescueTime API key from [https://www.rescuetime.com/anapi/manage](https://www.rescuetime.com/anapi/manage)
4. Add your API key to the `.env` file:
   ```
   RESCUETIME_API_KEY=your_api_key_here
   ```

## Usage

Generate a report for yesterday:
```
npm run report
```

Generate a report for a specific date:
```
npm run build
node dist/index.js 2025-04-24
```

Generate reports for the entire current month:
```
npm run report:month
```

All reports are saved in the `reports/` directory as Markdown files.

## Report Format

The report includes:
- Date and summary information
- Productivity pulse score
- Time distribution across productivity categories
- List of top activities for the day

## Requirements

- Node.js 14 or higher
- RescueTime account (Premium account recommended for more detailed data)