import axios from 'axios';
import * as dotenv from 'dotenv';
import { format, subDays, parseISO, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { promises as fs } from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

// API key should be set in a .env file
const API_KEY = process.env.RESCUETIME_API_KEY;

// Interfaces for API responses
interface DailySummary {
  id: number;
  date: string;
  productivity_pulse: number;
  very_productive_percentage: number;
  productive_percentage: number;
  neutral_percentage: number;
  distracting_percentage: number;
  very_distracting_percentage: number;
  all_productive_percentage: number;
  all_distracting_percentage: number;
  total_hours: number;
  total_duration_formatted: string;
  very_productive_hours: number;
  very_productive_duration_formatted: string;
  productive_hours: number;
  productive_duration_formatted: string;
  neutral_hours: number;
  neutral_duration_formatted: string;
  distracting_hours: number;
  distracting_duration_formatted: string;
  very_distracting_hours: number;
  very_distracting_duration_formatted: string;
}

interface ActivityData {
  rank: number;
  time_spent_seconds: number;
  number_of_people: number;
  activity: string;
  category: string;
  productivity: number;
}

// New interface for detailed document data
interface DocumentData {
  hour: string;
  title: string;
  application: string;
  time_spent_seconds: number;
  productivity: number;
}

// Group hourly document data by hour for easy reporting
interface HourlyDocumentData {
  [hour: string]: DocumentData[];
}

/**
 * Fetches the daily summary data from RescueTime API for a specific date
 * This implementation handles both recent and historical data
 */
async function getDailySummary(date?: string): Promise<DailySummary | null> {
  try {
    if (!API_KEY) {
      throw new Error('RESCUETIME_API_KEY not found in environment variables');
    }

    const targetDate = date || format(subDays(new Date(), 1), 'yyyy-MM-dd');
    console.log(`Fetching data for ${targetDate}...`);
    
    // First attempt: Try the daily summary feed with restrict_date
    let url = `https://www.rescuetime.com/anapi/daily_summary_feed?key=${API_KEY}&restrict_date=${targetDate}`;
    let response = await axios.get(url);
    
    if (response.status !== 200) {
      throw new Error(`Failed to fetch daily summary: ${response.statusText}`);
    }

    let summaries = response.data as DailySummary[];
    
    // Check if we got data for our target date
    const targetSummary = summaries.find(summary => summary.date === targetDate);
    
    // If we found data with the first attempt, return it
    if (targetSummary) {
      return targetSummary;
    }
    
    // Second attempt: Try the analytics API for historical data
    // This API can get data from any date in the past
    console.log(`No data found with daily summary feed, trying analytics API for ${targetDate}...`);
    
    url = `https://www.rescuetime.com/anapi/data?key=${API_KEY}&format=json&restrict_begin=${targetDate}&restrict_end=${targetDate}&perspective=interval&resolution_time=day`;
    response = await axios.get(url);
    
    if (response.status !== 200) {
      throw new Error(`Failed to fetch analytics data: ${response.statusText}`);
    }
    
    // If there's no data, the rows will be empty
    if (!response.data.rows || response.data.rows.length === 0) {
      console.log(`No data found for ${targetDate} using either API method`);
      return null;
    }
    
    // We need to convert the analytics API data to match the DailySummary interface
    console.log(`Converting analytics data to summary format for ${targetDate}...`);
    
    // The analytics API returns data in a different format, so we need to process it
    let totalSeconds = 0;
    let veryProductiveSeconds = 0;
    let productiveSeconds = 0;
    let neutralSeconds = 0;
    let distractingSeconds = 0;
    let veryDistractingSeconds = 0;
    let productivityPulse = 0;
    
    // Process each row of data
    response.data.rows.forEach((row: any) => {
      const seconds = row[1];
      const productivity = row[5]; // Productivity level (-2 to 2)
      
      totalSeconds += seconds;
      
      switch(productivity) {
        case 2:
          veryProductiveSeconds += seconds;
          break;
        case 1:
          productiveSeconds += seconds;
          break;
        case 0:
          neutralSeconds += seconds;
          break;
        case -1:
          distractingSeconds += seconds;
          break;
        case -2:
          veryDistractingSeconds += seconds;
          break;
      }
    });
    
    // Calculate percentages
    const veryProductivePercentage = totalSeconds > 0 ? (veryProductiveSeconds / totalSeconds) * 100 : 0;
    const productivePercentage = totalSeconds > 0 ? (productiveSeconds / totalSeconds) * 100 : 0;
    const neutralPercentage = totalSeconds > 0 ? (neutralSeconds / totalSeconds) * 100 : 0;
    const distractingPercentage = totalSeconds > 0 ? (distractingSeconds / totalSeconds) * 100 : 0;
    const veryDistractingPercentage = totalSeconds > 0 ? (veryDistractingSeconds / totalSeconds) * 100 : 0;
    
    // Calculate productivity pulse (0-100 scale)
    if (totalSeconds > 0) {
      productivityPulse = Math.round(
        ((veryProductiveSeconds * 2) + (productiveSeconds * 1) + (neutralSeconds * 0) + 
         (distractingSeconds * -1) + (veryDistractingSeconds * -2)) / 
        (totalSeconds / 3600) + 50
      );
    }
    
    // Format durations
    const formatDuration = (seconds: number): string => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    };
    
    // Create a DailySummary object from the analytics data
    const syntheticSummary: DailySummary = {
      id: new Date(targetDate).getTime(),
      date: targetDate,
      productivity_pulse: productivityPulse,
      very_productive_percentage: veryProductivePercentage,
      productive_percentage: productivePercentage,
      neutral_percentage: neutralPercentage,
      distracting_percentage: distractingPercentage,
      very_distracting_percentage: veryDistractingPercentage,
      all_productive_percentage: veryProductivePercentage + productivePercentage,
      all_distracting_percentage: distractingPercentage + veryDistractingPercentage,
      total_hours: totalSeconds / 3600,
      total_duration_formatted: formatDuration(totalSeconds),
      very_productive_hours: veryProductiveSeconds / 3600,
      very_productive_duration_formatted: formatDuration(veryProductiveSeconds),
      productive_hours: productiveSeconds / 3600,
      productive_duration_formatted: formatDuration(productiveSeconds),
      neutral_hours: neutralSeconds / 3600,
      neutral_duration_formatted: formatDuration(neutralSeconds),
      distracting_hours: distractingSeconds / 3600,
      distracting_duration_formatted: formatDuration(distractingSeconds),
      very_distracting_hours: veryDistractingSeconds / 3600,
      very_distracting_duration_formatted: formatDuration(veryDistractingSeconds),
    };
    
    return syntheticSummary;
  } catch (error) {
    console.error(`Error fetching daily summary for ${date}:`, error);
    return null;
  }
}

/**
 * Fetches detailed activity data from RescueTime API
 */
async function getDetailedActivities(date: string): Promise<ActivityData[]> {
  try {
    if (!API_KEY) {
      throw new Error('RESCUETIME_API_KEY not found in environment variables');
    }

    // Format the API URL with date range parameters
    const url = `https://www.rescuetime.com/anapi/data?key=${API_KEY}&perspective=interval&restrict_kind=activity&interval=hour&restrict_begin=${date}&restrict_end=${date}&format=json`;

    const response = await axios.get(url);

    if (response.status !== 200) {
      throw new Error(`Failed to fetch activity data: ${response.statusText}`);
    }

    // Process the response
    if (!response.data.rows || response.data.rows.length === 0) {
      return [];
    }

    // Map API response to ActivityData interface
    const activities = response.data.rows.map((row: any) => ({
      rank: row[0],
      time_spent_seconds: row[1],
      number_of_people: row[2],
      activity: row[3],
      category: row[4],
      productivity: row[5]
    }));

    // Group activities by type and sum time spent
    const groupedActivities: { [key: string]: ActivityData } = {};

    activities.forEach((activity: ActivityData) => {
      if (!groupedActivities[activity.activity]) {
        groupedActivities[activity.activity] = { ...activity };
      } else {
        groupedActivities[activity.activity].time_spent_seconds += activity.time_spent_seconds;
      }
    });

    // Convert back to array and sort by time spent
    return Object.values(groupedActivities).sort(
      (a, b) => b.time_spent_seconds - a.time_spent_seconds
    );
  } catch (error) {
    console.error('Error fetching detailed activities:', error);
    return [];
  }
}

/**
 * Fetches detailed document data (tab titles) from RescueTime API
 * This gets the exact tab titles used during each hour of the day
 */
async function getDetailedDocumentData(date: string): Promise<HourlyDocumentData> {
  try {
    if (!API_KEY) {
      throw new Error('RESCUETIME_API_KEY not found in environment variables');
    }

    // We use the document_filter to specifically get document/window titles
    const url = `https://www.rescuetime.com/anapi/data?key=${API_KEY}&perspective=interval&restrict_kind=document&interval=hour&restrict_begin=${date}&restrict_end=${date}&format=json`;
    
    console.log(`Fetching detailed document data for ${date}...`);
    const response = await axios.get(url);
    
    if (response.status !== 200) {
      throw new Error(`Failed to fetch document data: ${response.statusText}`);
    }

    // Process the response
    if (!response.data.rows || response.data.rows.length === 0) {
      return {};
    }

    // Group data by hour
    const hourlyData: HourlyDocumentData = {};
    
    response.data.rows.forEach((row: any) => {
      // Extract data from the API response
      // The row format depends on RescueTime's API structure
      // This is typically [rank, time_spent_seconds, people, document_title, category, productivity]
      const docData: DocumentData = {
        hour: row[0], // Might need formatting depending on API response
        time_spent_seconds: row[1],
        title: row[3],
        application: row[4] || 'Unknown',
        productivity: row[5],
      };
      
      // Extract hour from date-time string (e.g., "2025-04-25T14:00:00" -> "14:00")
      const hourMatch = docData.hour.match(/T(\d{2}:\d{2}):/);
      const hourKey = hourMatch ? hourMatch[1] : 'unknown';
      
      if (!hourlyData[hourKey]) {
        hourlyData[hourKey] = [];
      }
      
      hourlyData[hourKey].push(docData);
    });
    
    // Sort documents in each hour by time spent
    Object.keys(hourlyData).forEach(hour => {
      hourlyData[hour].sort((a, b) => b.time_spent_seconds - a.time_spent_seconds);
    });
    
    return hourlyData;
  } catch (error) {
    console.error('Error fetching document data:', error);
    return {};
  }
}

/**
 * Formats time in seconds to hours and minutes
 */
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

/**
 * Categorizes productivity level
 */
function getProductivityCategory(level: number): string {
  switch (level) {
    case 2: return 'very productive';
    case 1: return 'productive';
    case 0: return 'neutral';
    case -1: return 'distracting';
    case -2: return 'very distracting';
    default: return 'unknown';
  }
}

/**
 * Checks if a report file for the specified date already exists
 */
async function reportFileExists(date: string, reportsDir: string): Promise<boolean> {
  const fileName = `rescuetime-report-${date}.md`;
  const filePath = path.join(reportsDir, fileName);
  
  try {
    await fs.access(filePath);
    return true; // File exists
  } catch (error) {
    return false; // File does not exist
  }
}

/**
 * Generates a daily report for the specified date
 */
async function generateDailyReport(date?: string): Promise<string> {
  console.log("🚀 Generating daily report...", date);
  const targetDate = date || format(subDays(new Date(), 1), 'yyyy-MM-dd');

  // Fetch the summary data
  const summary = await getDailySummary(targetDate);
  if (!summary) {
    return `No data found for ${targetDate}`;
  }

  // Fetch detailed activities
  const activities = await getDetailedActivities(targetDate);
  
  // Fetch detailed document data (tab titles by hour)
  const hourlyDocuments = await getDetailedDocumentData(targetDate);

  // Construct the report
  const dateFormatted = format(parseISO(summary.date), 'EEEE, MMMM do, yyyy');
  let report = `# RescueTime Daily Report for ${dateFormatted}\n\n`;

  report += `## Summary\n`;
  report += `- Total time tracked: ${summary.total_duration_formatted} (${summary.total_hours.toFixed(2)} hours)\n`;
  
  // Fix for the productivity pulse issue - ensure it's a number between 0-100
  const productivityPulse = typeof summary.productivity_pulse === 'number' && 
    summary.productivity_pulse >= 0 && summary.productivity_pulse <= 100 
      ? summary.productivity_pulse 
      : Math.min(100, Math.max(0, Math.round(summary.productivity_pulse || 0)));
  
  report += `- Productivity pulse: ${productivityPulse}/100\n\n`;

  report += `## Time Distribution\n`;
  report += `- Very productive: ${summary.very_productive_duration_formatted} (${summary.very_productive_percentage.toFixed(1)}%)\n`;
  report += `- Productive: ${summary.productive_duration_formatted} (${summary.productive_percentage.toFixed(1)}%)\n`;
  report += `- Neutral: ${summary.neutral_duration_formatted} (${summary.neutral_percentage.toFixed(1)}%)\n`;
  report += `- Distracting: ${summary.distracting_duration_formatted} (${summary.distracting_percentage.toFixed(1)}%)\n`;
  report += `- Very distracting: ${summary.very_distracting_duration_formatted} (${summary.very_distracting_percentage.toFixed(1)}%)\n\n`;

  if (activities.length > 0) {
    report += `## Top Activities\n`;

    // Show top 15 activities
    const topActivities = activities.slice(0, 15);
    topActivities.forEach(activity => {
      const timeFormatted = formatTime(activity.time_spent_seconds);
      const category = getProductivityCategory(activity.productivity);
      report += `- ${activity.activity} (${timeFormatted}) - ${activity.category} (${category})\n`;
    });
    
    report += '\n';
  }
  
  // Add hourly breakdown with tab titles
  if (Object.keys(hourlyDocuments).length > 0) {
    report += `## Hourly Breakdown with Tab Titles\n\n`;
    
    // Get all hours sorted
    const sortedHours = Object.keys(hourlyDocuments).sort();
    
    // Process each hour
    sortedHours.forEach(hour => {
      report += `### ${hour}\n\n`;
      
      // Get top 10 documents for each hour
      const topDocs = hourlyDocuments[hour].slice(0, 10);
      
      if (topDocs.length > 0) {
        topDocs.forEach(doc => {
          const timeFormatted = formatTime(doc.time_spent_seconds);
          const category = getProductivityCategory(doc.productivity);
          report += `- **${doc.title}** (${timeFormatted}) - ${doc.application} (${category})\n`;
        });
      } else {
        report += `No detailed data available for this hour.\n`;
      }
      
      report += '\n';
    });
  }

  return report;
}

/**
 * Ensures the reports directory exists
 */
async function ensureReportsDirectory() {
  const reportsDir = path.join(process.cwd(), 'reports');
  try {
    await fs.access(reportsDir);
  } catch (error) {
    // Directory doesn't exist, create it
    await fs.mkdir(reportsDir, { recursive: true });
  }
  return reportsDir;
}

/**
 * Generates reports for all days in the specified month and year
 */
async function generateMonthlyReports(year: number, month: number) {
  const startDate = startOfMonth(new Date(year, month - 1));
  const endDate = endOfMonth(new Date(year, month - 1));

  // Create an array of all days in the month
  const daysInMonth = eachDayOfInterval({ start: startDate, end: endDate });

  // Ensure the reports directory exists
  const reportsDir = await ensureReportsDirectory();

  console.log(`Generating reports for ${format(startDate, 'MMMM yyyy')}...`);

  // Generate a report for each day
  for (const day of daysInMonth) {
    const dateString = format(day, 'yyyy-MM-dd');
    
    // Check if report already exists
    const exists = await reportFileExists(dateString, reportsDir);
    if (exists) {
      console.log(`Skipping ${dateString} - report already exists`);
      continue;
    }
    
    console.log(`Processing ${dateString}...`);
    
    const report = await generateDailyReport(dateString);

    // Save the report to a file in the reports directory
    const fileName = `rescuetime-report-${dateString}.md`;
    const filePath = path.join(reportsDir, fileName);
    await fs.writeFile(filePath, report);

    console.log(`Saved report for ${dateString} to ${fileName}`);
  }

  console.log(`\nAll reports for ${format(startDate, 'MMMM yyyy')} have been generated and saved to the 'reports/' directory.`);
}

/**
 * Main function to execute the script
 */
async function main() {
  try {
    // Ensure the reports directory exists
    const reportsDir = await ensureReportsDirectory();
    
    // Check command-line arguments
    if (process.argv.length >= 3 && process.argv[2] === '--month') {
      // Get the current month and year
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1; // JavaScript months are 0-indexed

      // Generate reports for the current month
      await generateMonthlyReports(currentYear, currentMonth);
    } else if (process.argv.length >= 3) {
      // Generate a single report for the specified date
      const dateParam = process.argv[2]; // Format should be YYYY-MM-DD
      
      // Check if report already exists
      const exists = await reportFileExists(dateParam, reportsDir);
      if (exists) {
        console.log(`Skipping ${dateParam} - report already exists`);
        return;
      }
      
      console.log(`Processing ${dateParam}...`);
      const report = await generateDailyReport(dateParam);

      console.log(report);

      // Save the report to a file in the reports directory
      const fileName = `rescuetime-report-${dateParam}.md`;
      const filePath = path.join(reportsDir, fileName);
      await fs.writeFile(filePath, report);

      console.log(`\nReport saved to ${filePath}`);
    } else {
      // Default: Generate report for yesterday
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      
      // Check if report already exists
      const exists = await reportFileExists(yesterday, reportsDir);
      if (exists) {
        console.log(`Skipping ${yesterday} - report already exists`);
        return;
      }
      
      console.log(`Processing ${yesterday}...`);
      const report = await generateDailyReport(yesterday);

      console.log(report);

      // Save the report to a file in the reports directory
      const fileName = `rescuetime-report-${yesterday}.md`;
      const filePath = path.join(reportsDir, fileName);
      await fs.writeFile(filePath, report);

      console.log(`\nReport saved to ${filePath}`);
    }
  } catch (error) {
    console.error('Error generating reports:', error);
  }
}

// Run the script
main();