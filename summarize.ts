import * as dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import axios from 'axios';
import { format, parse, compareDesc } from 'date-fns';

// Load environment variables
dotenv.config();

// API key for OpenAI should be set in a .env file
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface Summary {
  date: string;
  content: string;
}

/**
 * Reads the PROMPT.md file to get the template for OpenAI
 */
async function getPromptTemplate(): Promise<string> {
  try {
    return await fs.readFile(path.join(process.cwd(), 'PROMPT.md'), 'utf-8');
  } catch (error) {
    console.error('Error reading PROMPT.md file:', error);
    return '';
  }
}

/**
 * Reads a RescueTime report file
 */
async function readReportFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    console.error(`Error reading report file ${filePath}:`, error);
    return '';
  }
}

/**
 * Reads a GitHub commits file for a specific date
 */
async function readGitHubCommitsFile(date: string): Promise<string> {
  const commitsDir = path.join(process.cwd(), 'context', 'commits');
  const fileName = `github-commits-${date}.md`;
  const filePath = path.join(commitsDir, fileName);

  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    // If file doesn't exist, return empty string (no commits for that day)
    return '';
  }
}

/**
 * Ensures the summaries directory exists
 */
async function ensureSummariesDirectory() {
  const summariesDir = path.join(process.cwd(), 'summaries');
  try {
    await fs.access(summariesDir);
  } catch (error) {
    // Directory doesn't exist, create it
    await fs.mkdir(summariesDir, { recursive: true });
  }
  return summariesDir;
}

/**
 * Checks if a summary file already exists
 */
async function summaryFileExists(date: string, summariesDir: string): Promise<boolean> {
  const fileName = `summary-${date}.md`;
  const filePath = path.join(summariesDir, fileName);

  try {
    await fs.access(filePath);
    return true; // File exists
  } catch (error) {
    return false; // File does not exist
  }
}

/**
 * Gets a list of all RescueTime report files in chronological order
 */
async function getReportFiles(): Promise<string[]> {
  const reportsDir = path.join(process.cwd(), 'reports');

  try {
    const files = await fs.readdir(reportsDir);
    const reportFiles = files
      .filter(file => file.startsWith('rescuetime-report-') && file.endsWith('.md'))
      .map(file => ({
        name: file,
        date: file.replace('rescuetime-report-', '').replace('.md', '')
      }))
      .sort((a, b) => {
        const dateA = parse(a.date, 'yyyy-MM-dd', new Date());
        const dateB = parse(b.date, 'yyyy-MM-dd', new Date());
        return compareDesc(dateB, dateA); // Sort in ascending order
      })
      .map(file => path.join(reportsDir, file.name));

    return reportFiles;
  } catch (error) {
    console.error('Error reading reports directory:', error);
    return [];
  }
}

/**
 * Gets existing summaries in chronological order
 */
async function getExistingSummaries(): Promise<Summary[]> {
  const summariesDir = path.join(process.cwd(), 'summaries');

  try {
    const files = await fs.readdir(summariesDir);

    const summaries: Summary[] = [];

    for (const file of files) {
      if (file.startsWith('summary-') && file.endsWith('.md')) {
        const date = file.replace('summary-', '').replace('.md', '');
        const content = await fs.readFile(path.join(summariesDir, file), 'utf-8');
        summaries.push({ date, content });
      }
    }

    return summaries.sort((a, b) => {
      const dateA = parse(a.date, 'yyyy-MM-dd', new Date());
      const dateB = parse(b.date, 'yyyy-MM-dd', new Date());
      return compareDesc(dateB, dateA); // Sort in ascending order
    });
  } catch (error) {
    console.error('Error reading summaries directory:', error);
    return [];
  }
}

/**
 * Recursively read all files in a directory
 */
async function readAllFilesInDirectory(directoryPath: string): Promise<{ [filePath: string]: string }> {
  const result: { [filePath: string]: string } = {};

  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        const subDirFiles = await readAllFilesInDirectory(fullPath);
        Object.assign(result, subDirFiles);
      } else {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          result[fullPath] = content;
        } catch (error) {
          console.error(`Error reading file ${fullPath}:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${directoryPath}:`, error);
  }

  return result;
}

/**
 * Get all context files content from /context directory
 */
async function getContextFilesContent(): Promise<string> {
  const contextDir = path.join(process.cwd(), 'context');
  let contextContent = '';

  try {
    const filesContent = await readAllFilesInDirectory(contextDir);

    for (const [filePath, content] of Object.entries(filesContent)) {
      // Add each file with a header showing its path
      const relativePath = path.relative(process.cwd(), filePath);
      contextContent += `\n\n## File: ${relativePath}\n\n${content}`;
    }
  } catch (error) {
    console.error('Error reading context directory:', error);
  }

  return contextContent;
}

/**
 * Generate a summary using OpenAI API
 */
async function generateSummary(reportContent: string, promptTemplate: string, previousSummaries: Summary[], date: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not found in environment variables');
  }

  // Get the most recent 3 summaries for context
  const recentSummaries = previousSummaries.slice(0, 3);
  let contextText = '';

  if (recentSummaries.length > 0) {
    contextText = 'Previous days summaries for extended context:\n\n';
    recentSummaries.forEach(summary => {
      contextText += `${summary.date}:\n${summary.content}\n\n`;
    });
  }

  // Get GitHub commits for this specific date
  const githubCommitsContent = await readGitHubCommitsFile(date);
  let commitsContext = '';
  if (githubCommitsContent) {
    commitsContext = `\n\nGitHub Commits for ${date}:\n\n${githubCommitsContent}`;
  }

  const prompt = `\n${contextText}${commitsContext}\n\nReport to summarize:\n\n${reportContent}`;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: promptTemplate
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7
        // max_tokens: 300
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    if (error instanceof Error && 'response' in error) {
      console.log((error as any).response.data);
    }
    return 'Failed to generate summary due to an API error.';
  }
}

/**
 * Main function to generate summaries for all reports
 */
async function main() {
  try {
    // Ensure summaries directory exists
    const summariesDir = await ensureSummariesDirectory();

    // Get the prompt template
    const promptTemplate = await getPromptTemplate();

    // Get all report files
    const reportFiles = await getReportFiles();

    if (reportFiles.length === 0) {
      console.log('No report files found.');
      return;
    }

    console.log(`Found ${reportFiles.length} report files.`);

    // Process each report file
    for (const reportFile of reportFiles) {
      // Extract date from filename
      const match = reportFile.match(/rescuetime-report-(\d{4}-\d{2}-\d{2})\.md$/);

      if (!match) {
        console.log(`Skipping ${reportFile} - invalid filename format`);
        continue;
      }

      const date = match[1];

      // Check if summary already exists
      const exists = await summaryFileExists(date, summariesDir);
      if (exists) {
        console.log(`Skipping ${date} - summary already exists`);
        continue;
      }

      console.log(`Processing ${date}...`);

      // Read the report content
      const reportContent = await readReportFile(reportFile);

      // Get existing summaries for context
      const existingSummaries = await getExistingSummaries();

      // Generate the summary
      const summary = await generateSummary(reportContent, promptTemplate, existingSummaries, date);

      // Save the summary
      const summaryFileName = `summary-${date}.md`;
      const summaryFilePath = path.join(summariesDir, summaryFileName);
      await fs.writeFile(summaryFilePath, summary);

      console.log(`Saved summary for ${date} to ${summaryFileName}`);

      // Add the new summary to the existing ones for context in future iterations
      existingSummaries.unshift({ date, content: summary });
    }

    console.log('All summaries generated successfully.');
  } catch (error) {
    console.error('Error generating summaries:', error);
  }
}

// Run the script
main();