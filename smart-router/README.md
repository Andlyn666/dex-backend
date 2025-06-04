# PancakeSwap Router Service

A microservice that wraps the PancakeSwap V4Router SDK for use from any programming language via HTTP requests.

## Features

- Get best trades for token pairs on PancakeSwap
- Separate pool fetching and trade calculation for improved performance
- Support for multiple trade amounts in a single request
- Cache pools for reuse in subsequent requests
- Detailed performance metrics

## Quickstart with Docker

The easiest way to run the service is using Docker and Docker Compose.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/) (usually included with Docker Desktop)

### Running the Service

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/pancakeswap-router-service.git
   cd pancakeswap-router-service
   ```

2. Start the service:
   ```
   docker-compose up -d
   ```

3. The service is now running on http://localhost:3000

### Stopping the Service

```
docker-compose down
```

## API Endpoints

### GET /health

Check the health of the service.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2023-08-15T12:34:56.789Z"
}
```

### POST /fetch-pools

Fetch and cache pools for a token pair.

**Request Body:**
```json
{
  "fromCurrency": "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
  "toCurrency": "0x55d398326f99059fF775485246999027B3197955"
}
```

**Response:**
```json
{
  "poolsKey": "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82_0x55d398326f99059fF775485246999027B3197955",
  "poolCount": 42,
  "timing": {
    "fetchTimeMs": "3500.20"
  }
}
```

### POST /get-best-trade

Get best trade(s) for a token pair.

**Request Body:**
```json
{
  "amounts": ["10000000000000000", "50000000000000000"],
  "fromCurrency": "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
  "toCurrency": "0x55d398326f99059fF775485246999027B3197955",
  "tradeType": "EXACT_INPUT",
  "poolsKey": "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82_0x55d398326f99059fF775485246999027B3197955"
}
```

**Response:**
```json
{
  "results": [
    {
      "inputAmount": "10000000000000000",
      "calculationTimeMs": "120.45",
      "amountIn": "0.01",
      "amountOut": "3.25",
      "route": [...]
    },
    {
      "inputAmount": "50000000000000000",
      "calculationTimeMs": "125.30",
      "amountIn": "0.05",
      "amountOut": "16.20",
      "route": [...]
    }
  ],
  "timing": {
    "totalTimeMs": "254.33",
    "poolFetchTimeMs": "8.58",
    "tradeCalculationsTimeMs": "245.75"
  }
}
```

## Using with Python

A Python client is included in this repository:

```python
from pancakeswap_client import PancakeSwapRouter

# Initialize the client
router = PancakeSwapRouter("http://localhost:3000")

# Pre-fetch pools (optional)
pools_info = router.fetch_pools("0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", "0x55d398326f99059fF775485246999027B3197955")

# Get a single trade
trade = router.get_best_trade("10000000000000000", "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", "0x55d398326f99059fF775485246999027B3197955")

# Get multiple trades with timing info
result = router.get_best_trade(
    ["10000000000000000", "50000000000000000"], 
    "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", 
    "0x55d398326f99059fF775485246999027B3197955", 
    include_timing=True
)
```

## Building and Running Without Docker

### Prerequisites

- Node.js 18+
- npm

### Installation

1. Install dependencies:
   ```
   npm install
   ```

2. Start the service:
   ```
   node bootstrap.js
   ```

## License

MIT 