import dotenv from 'dotenv';
import { withRetry } from './utils';
import axios from 'axios';
import logger from './logger';
dotenv.config();

export class PriceManager {
  prices: { [address_date: string]: { usd: number } };
  key: string;
  priceSymbolList: any[];
  platform: string;
  constructor(chain: string) {
    this.platform = chain;
    this.prices = {};
    this.key = process.env.CG_API_KEY ? process.env.CG_API_KEY : '';
  }
    async fetchCoinList() {
    const url = 'https://pro-api.coingecko.com/api/v3/coins/list?include_platform=true';
    const options = {
      headers: { accept: 'application/json', 'x-cg-pro-api-key': this.key },
      timeout: 20000 // 20秒超时
    };
    try {
      const response = await axios.get(url, options);
      let res = response.data;
      const resThis = res.filter((coin: any) => coin.platforms[this.platform]);
      const resEth = res.filter((coin: any) => coin.platforms['ethereum']);
      res = resThis.concat(resEth);
      this.priceSymbolList = res.map((coin: any) => ({
        id: coin.id,
        address: coin.platforms[this.platform] ? coin.platforms[this.platform] : coin.platforms['ethereum'],
        symbol: coin.symbol.toUpperCase()
      }));
    } catch (err) {
      logger.error('Error fetching coin list:', err);
    }
  }
  
  getTokenIdByAddress(tokenAddress: string): string {
    const token = this.priceSymbolList.find((coin: any) => coin.address.toLowerCase() === tokenAddress.toLowerCase());
    if (token) {
        return token.id;
    } else {
      logger.error(`Token address ${tokenAddress} not found in price list`);
       return '';
    }
  }
  async callGetHisPrice(tokenAddress: string, date: string) {
    if (!this.priceSymbolList) {
      await withRetry(() => this.fetchCoinList(), 3, 2000);
    }
    const id = this.getTokenIdByAddress(tokenAddress);
    if (id === '') {
      logger.error(`Token address ${tokenAddress} not found in price list`);
      throw new Error(`Token address ${tokenAddress} not found`);
    }
    const url = 'https://pro-api.coingecko.com/api/v3/coins/'+id+'/history?date=' + date;
    const options = {
      headers: { accept: 'application/json', 'x-cg-pro-api-key': this.key },
      timeout: 50000
    };
    try {
        const response = await axios.get(url, options);
        const result = await response.data;
        const usdPrice = result.market_data?.current_price?.usd || 0;
        return usdPrice;
    } catch (error) {
        logger.error(`Error fetching price for ${tokenAddress} on ${date}:`, error);
        return 0;
    }
  }
  async fetchTokenPrice(tokenAddress: string, date: string) {
    const cacheKey = `${tokenAddress.toLowerCase()}_${date}`;
    if (this.prices[cacheKey]) {
      return this.prices[cacheKey].usd;
    }
    const usdPrice = (await withRetry(() => this.callGetHisPrice(tokenAddress, date), 5, 2000)) as number;
    if (usdPrice === 0) {
      logger.error(`Failed to fetch price for ${tokenAddress} on ${date}`);
      return 0;
    }
    this.prices[cacheKey] = { usd: usdPrice };
    return usdPrice;
  }
}

const priceManagerMap: { [chain: string]: PriceManager } = {};

export function getTokenPriceManager(chain: string): PriceManager {
    if (!priceManagerMap[chain]) {
        priceManagerMap[chain] = new PriceManager(chain);
    }
    return priceManagerMap[chain];
}


