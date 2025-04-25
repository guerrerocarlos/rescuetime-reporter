import axios from 'axios';
import { format, startOfMonth } from 'date-fns';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

// GitHub API configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME || 'your-github-username';

// Date range for fetching commits (current month only)
const endDate = new Date();
const startDate = startOfMonth(endDate);

interface GitHubCommit {
  sha: string;
  commit: {
    author: {
      name: string;
      date: string;
    };
    message: string;
  };
  html_url: string;
  repository: {
    name: string;
    full_name?: string;
    html_url?: string;
  };
}

interface Repository {
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
}

interface Organization {
  login: string;
}

// Check if a rate limit is exceeded
function checkRateLimit(error: any) {
  if (error.response && error.response.status === 403) {
    console.log('⚠️ GitHub API rate limit exceeded. Try again later or use a personal access token.');
    console.log(`Reset time: ${new Date(error.response.headers['x-ratelimit-reset'] * 1000).toLocaleString()}`);
  } else if (error.response) {
    console.error(`Error (${error.response.status}): ${error.response.data.message || 'Unknown error'}`);
  } else {
    console.error('Network error:', error.message);
  }
}

async function fetchAllPagesFromAPI<T>(url: string, params: any = {}, headers: any = {}): Promise<T[]> {
  let page = 1;
  let hasNextPage = true;
  const allResults: T[] = [];
  const baseParams = { ...params, per_page: 100 }; // Max items per page

  while (hasNextPage) {
    try {
      const response = await axios.get(url, {
        params: { ...baseParams, page },
        headers: {
          ...headers,
          Authorization: GITHUB_TOKEN ? `Bearer ${GITHUB_TOKEN}` : undefined,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      const currentPageResults = response.data;
      
      // For search API, the items are in the 'items' property
      const results = Array.isArray(currentPageResults) ? currentPageResults : currentPageResults.items;
      
      if (!results || results.length === 0) {
        hasNextPage = false;
      } else {
        allResults.push(...results);
        page++;
        
        // Check if we've reached the last page by looking at Link headers
        const linkHeader = response.headers.link;
        if (!linkHeader || !linkHeader.includes('rel="next"')) {
          hasNextPage = false;
        }
        
        // Add a small delay to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      checkRateLimit(error);
      hasNextPage = false;
    }
  }

  return allResults;
}

async function fetchUserOrganizations(): Promise<Organization[]> {
  return await fetchAllPagesFromAPI<Organization>(`https://api.github.com/users/${GITHUB_USERNAME}/orgs`);
}

async function fetchOrganizationRepositories(orgName: string): Promise<Repository[]> {
  return await fetchAllPagesFromAPI<Repository>(`https://api.github.com/orgs/${orgName}/repos`);
}

async function fetchUserRepositories(): Promise<Repository[]> {
  return await fetchAllPagesFromAPI<Repository>(`https://api.github.com/users/${GITHUB_USERNAME}/repos`);
}

async function fetchCommitsForRepo(owner: string, repo: string): Promise<GitHubCommit[]> {
  const since = format(startDate, 'yyyy-MM-dd');
  try {
    const commits = await fetchAllPagesFromAPI<any>(
      `https://api.github.com/repos/${owner}/${repo}/commits`,
      {
        since: `${since}T00:00:00Z`,
        author: GITHUB_USERNAME,
      }
    );

    // Add repository info to each commit
    return commits.map((commit: any) => ({
      ...commit,
      repository: { 
        name: repo,
        full_name: `${owner}/${repo}`,
        html_url: `https://github.com/${owner}/${repo}`
      }
    }));
  } catch (error) {
    // Just return empty array for repos with errors (might be private, etc)
    return [];
  }
}

async function searchUserCommits(): Promise<GitHubCommit[]> {
  const since = format(startDate, 'yyyy-MM-dd');
  try {
    const query = `author:${GITHUB_USERNAME} committer-date:>=${since}`;
    console.log(`Searching for commits with query: ${query}`);
    
    // Use the search API with pagination
    const searchResults = await fetchAllPagesFromAPI<any>(
      'https://api.github.com/search/commits',
      {
        q: query,
        sort: 'committer-date',
        order: 'desc',
      },
      {
        Accept: 'application/vnd.github.cloak-preview',  // Required for commits search
      }
    );

    // Because fetchAllPagesFromAPI already extracts the 'items', we're getting the search items directly
    console.log(`Found ${searchResults.length} commits via search API.`);
    
    return searchResults.map((item: any) => {
      const repoFullName = item.repository.full_name;
      const [owner, repoName] = repoFullName.split('/');
      
      return {
        sha: item.sha,
        commit: {
          author: {
            name: item.commit.author.name,
            date: item.commit.author.date,
          },
          message: item.commit.message,
        },
        html_url: item.html_url,
        repository: {
          name: repoName,
          full_name: repoFullName,
          html_url: item.repository.html_url,
        }
      };
    });
  } catch (error) {
    checkRateLimit(error);
    console.warn('Search API error. Falling back to repository iteration approach.');
    return [];
  }
}

async function main() {
  if (!GITHUB_TOKEN) {
    console.log('⚠️ No GITHUB_TOKEN found in .env file. Rate limits may apply.');
    console.log('Create a token at https://github.com/settings/tokens and add it to .env as GITHUB_TOKEN=your_token');
    console.log('For best results, the token should have "repo" scope access.');
  }
  
  if (GITHUB_USERNAME === 'your-github-username') {
    console.log('⚠️ Please set your GITHUB_USERNAME in .env file');
    return;
  }

  console.log(`Fetching commits for ${GITHUB_USERNAME} from ${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}...`);

  // Approach 1: Use Search API (most comprehensive but could hit rate limits)
  let allCommits: GitHubCommit[] = [];
  
  try {
    const searchCommits = await searchUserCommits();
    if (searchCommits.length > 0) {
      allCommits = searchCommits;
      console.log(`Successfully found ${allCommits.length} commits via Search API.`);
    } else {
      throw new Error('Search API returned no results. Falling back to repository iteration.');
    }
  } catch (error) {
    console.log('Falling back to direct repository iteration approach...');
    
    // Approach 2: Iterate through repositories (personal + organizations)
    // 1. Get user's repositories
    const userRepos = await fetchUserRepositories();
    console.log(`Found ${userRepos.length} personal repositories`);
    
    // 2. Get organizations the user belongs to
    const orgs = await fetchUserOrganizations();
    console.log(`Found ${orgs.length} organizations: ${orgs.map(o => o.login).join(', ')}`);
    
    // 3. Get repositories from each organization
    const orgReposPromises = orgs.map(org => fetchOrganizationRepositories(org.login));
    const orgReposArrays = await Promise.all(orgReposPromises);
    const orgRepos = orgReposArrays.flat();
    console.log(`Found ${orgRepos.length} repositories from organizations`);
    
    // 4. Combine all repositories
    const allRepos = [...userRepos, ...orgRepos];
    console.log(`Processing ${allRepos.length} total repositories...`);
    
    // 5. Fetch commits for each repository in parallel (with throttling to avoid rate limits)
    const commitsPromises = allRepos.map(repo => 
      fetchCommitsForRepo(repo.owner.login, repo.name)
    );
    
    const commitsArrays = await Promise.all(commitsPromises);
    allCommits = commitsArrays.flat();
  }
  
  // Sort all commits by date (newest first)
  const commits = allCommits.sort((a, b) => 
    new Date(b.commit.author.date).getTime() - new Date(a.commit.author.date).getTime()
  );

  console.log(`Found a total of ${commits.length} commits in the last month\n`);

  // Group commits by date
  const commitsByDate: Record<string, GitHubCommit[]> = {};
  
  commits.forEach(commit => {
    const date = format(new Date(commit.commit.author.date), 'yyyy-MM-dd');
    if (!commitsByDate[date]) {
      commitsByDate[date] = [];
    }
    commitsByDate[date].push(commit);
  });

  // Generate report
  const report = [`# GitHub Commits Report - Last Month\n`];
  report.push(`Period: ${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}\n`);
  report.push(`User: ${GITHUB_USERNAME}\n`);
  report.push(`Total Commits: ${commits.length}\n`);
  
  Object.keys(commitsByDate).sort().reverse().forEach(date => {
    report.push(`## ${date}`);
    
    const repoCommits: Record<string, GitHubCommit[]> = {};
    commitsByDate[date].forEach(commit => {
      const repoFullName = commit.repository.full_name || commit.repository.name;
      if (!repoCommits[repoFullName]) {
        repoCommits[repoFullName] = [];
      }
      repoCommits[repoFullName].push(commit);
    });

    Object.keys(repoCommits).forEach(repoName => {
      report.push(`### ${repoName}`);
      
      repoCommits[repoName].forEach(commit => {
        const shortSha = commit.sha.substring(0, 7);
        const message = commit.commit.message.split('\n')[0]; // First line of commit message
        report.push(`- [${shortSha}](${commit.html_url}) ${message}`);
      });
      
      report.push('');
    });
  });

  // Ensure the context/commits directory exists
  const reportsDir = path.join(process.cwd(), 'context', 'commits');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // Save report to file
  const reportPath = path.join(reportsDir, `github-commits-${format(new Date(), 'yyyy-MM-dd')}.md`);
  fs.writeFileSync(reportPath, report.join('\n'));
  
  console.log(`Report saved to: ${reportPath}`);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});