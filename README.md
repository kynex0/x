# Twitter Follower Bot

A Puppeteer-based Twitter bot that automatically follows the followers of target accounts. This bot simulates human-like behavior to reduce detection risk.

## Features

- **Automated Login**: Securely logs in to your Twitter account
- **Target Following**: Follows followers of specified target accounts
- **Human-like Behavior**: Simulates human interaction with random delays and mouse movements
- **Smart Retries**: Automatically retries on errors or timeouts
- **Proxy Support**: Supports HTTP/HTTPS proxies for better anonymity
- **Screenshot Categorization**: Automatically saves screenshots for debugging in organized folders
- **Detailed Logging**: Comprehensive logging for troubleshooting

## Requirements

- Node.js (v14 or higher)
- NPM (v6 or higher)
- A Twitter account
- (Optional) HTTP/HTTPS proxy

## Installation

1. Clone this repository:
```bash
git clone https://github.com/kynex0/twitter-follower-bot.git
cd twitter-follower-bot
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the project root and add your Twitter credentials:
```
X_USERNAME=your_twitter_username
X_PASSWORD=your_twitter_password
NAVIGATION_TIMEOUT=180000
RETRY_ATTEMPTS=3
FOLLOW_DELAY_MIN=30
FOLLOW_DELAY_MAX=60
MAX_FOLLOWS_PER_DAY=15
HUMAN_LIKE_TYPING=true

# Optional proxy settings
# PROXY_HOST=your_proxy_host
# PROXY_PORT=your_proxy_port
# PROXY_USERNAME=your_proxy_username
# PROXY_PASSWORD=your_proxy_password
```

## Usage

```bash
node index.js targetUsername
```

Replace `targetUsername` with the Twitter username whose followers you want to follow.

You can also specify multiple target accounts:

```bash
node index.js username1 username2 username3
```

## Example

```bash
node index.js elonmusk
```

This will log in to your Twitter account and start following Elon Musk's followers.

## How It Works

1. The bot logs in to your Twitter account using Puppeteer
2. It navigates to the followers page of the target account
3. It extracts the usernames of followers
4. It visits each follower's profile and clicks the follow button
5. It adds random delays between actions to simulate human behavior
6. It takes screenshots during the process and organizes them by category for troubleshooting

## Advanced Configuration

You can customize the bot's behavior by modifying the environment variables in the `.env` file:

- `NAVIGATION_TIMEOUT`: Maximum time (in ms) to wait for page navigation (default: 180000)
- `RETRY_ATTEMPTS`: Number of login retry attempts (default: 3)
- `FOLLOW_DELAY_MIN`: Minimum delay (in seconds) between follow actions (default: 30)
- `FOLLOW_DELAY_MAX`: Maximum delay (in seconds) between follow actions (default: 60)
- `MAX_FOLLOWS_PER_DAY`: Maximum number of users to follow per day (default: 15)
- `HUMAN_LIKE_TYPING`: Enable human-like typing behavior (default: true)

## Caution and Disclaimer

This bot is for educational purposes only. Using bots on Twitter may violate their Terms of Service and could result in your account being suspended or banned. Use at your own risk.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Acknowledgments

- Built with [Puppeteer](https://github.com/puppeteer/puppeteer)
- Inspired by the need for ethical social media growth strategies 