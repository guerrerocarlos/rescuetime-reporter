# RescueTime Daily Report Generator

A TypeScript script that generates a daily summary report of your RescueTime data.

## Features

- Fetches your daily summary data from RescueTime
- Displays total hours tracked, productive time, and productivity pulse
- Shows time distribution across productivity categories
- Lists your top activities for the day
- Provides hourly breakdown with tab titles
- Fetches your GitHub commits for additional context
- Creates AI-summarized daily activity reports
- Saves the report as a Markdown file
- Supports generating reports for an entire month at once

## Example outputs:


### Rescuetime reports:

```md
# RescueTime Daily Report for Friday, April 25th, 2025

## Summary
- Total time tracked: 5h 19m (5.32 hours)
- Total Productive time: 5h 16m (5.3 h)
- Productivity pulse: 100/100

## Time Distribution
- Very productive: 4h 5m (77.0%)
- Productive: 0h 26m (8.4%)
- Neutral: 0h 44m (13.9%)
- Distracting: 0h 0m (0.0%)
- Very distracting: 0h 2m (0.7%)

## Top Activities
- Visual Studio Code (2h 45m) - Editing & IDEs (very productive)
- Slack (1h 0m) - General Software Development (very productive)
```

### LLM generated reports:

```
April 25th, 2025: Made significant contributions focused on the Slack bot and distributed architecture. Key accomplishments included:

- Developed and refined the presentation for the "SDK" project, enhancing the architectural overview and connections.
- Engaged in multiple productive meetings to discuss infrastructure synchronization and project alignment, furthering collaboration with the team.
- Collaborated through Slack to ensure smooth communication on ongoing tasks and updates, facilitating effective teamwork.
- Continued coding efforts in Visual Studio Code, specifically working on the `index.ts` file for the Slack bot, contributing to its functionality and integration.

These activities were crucial in advancing the development of intelligent software agents and improving internal communication tools at rPotential.ai.
```

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
   GITHUB_USERNAME=your_github_username
   GITHUB_TOKEN=your_github_token
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

Fetch GitHub commits for additional context:
```
npm run github-commits
```

Generate an AI summary of your daily activity:
```
npm run summarize 2025-04-24
```

All reports are saved in the `reports/` directory as Markdown files.
GitHub commits are stored in `context/commits/` directory.
AI summaries are stored in `summaries/` directory.

## Report Format

The report includes:
- Date and summary information
- Total time tracked
- Total Productive time (excluding very distracting time)
- Productivity pulse score
- Time distribution across productivity categories
- List of top activities for the day
- Hourly breakdown with detailed tab titles

## Requirements

- Node.js 14 or higher
- RescueTime account (Premium account recommended for more detailed data)
- GitHub account (for accessing commit history)

