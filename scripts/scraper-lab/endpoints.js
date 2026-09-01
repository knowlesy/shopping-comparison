/**
 * Retailer Endpoint Registry and Request Builders
 */

export const RETAILER_ENDPOINTS = {
  tesco: {
    name: 'Tesco',
    supported: true,
    url: (q) => `https://xapi.tesco.com/graphql`,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // UNUSED / DEPRECATED: Shipped adapter extracts dehydrated Apollo Client state from search HTML SSR; static x-apikey is not used
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'accept': 'application/json'
    },
    buildBody: (query) => JSON.stringify({
      operationName: 'SearchProducts',
      variables: { query, page: 1, count: 24 },
      query: `query SearchProducts($query: String!, $page: Int, $count: Int) {
        search(query: $query, page: $page, count: $count) {
          results {
            id
            title
            brand
            price { actual unitPrice unitOfMeasure }
            promotions { description promotionType }
            image
            status
          }
        }
      }`
    }),
    fallbackUrl: (q) => `https://www.tesco.com/groceries/en-GB/search?query=${encodeURIComponent(q)}`
  },
  sainsburys: {
    name: "Sainsbury's",
    supported: true,
    url: (q) => `https://www.sainsburys.co.uk/groceries-api/gol-services/product/v1/product?filter[keyword]=${encodeURIComponent(q)}&page_number=1&page_size=24`,
    method: 'GET',
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'accept': 'application/json',
      'accept-language': 'en-GB,en;q=0.9'
    }
  },
  asda: {
    name: 'Asda',
    supported: true,
    url: (q) => `https://groceries.asda.com/api/v2/search?requestorigin=gi&keyword=${encodeURIComponent(q)}`,
    method: 'GET',
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'accept': 'application/json',
      'request-origin': 'gi'
    }
  },
  morrisons: {
    name: 'Morrisons',
    supported: true,
    url: (q) => `https://groceries.morrisons.com/web/v4/products?searchTerm=${encodeURIComponent(q)}`,
    method: 'GET',
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'accept': 'application/json'
    }
  },
  iceland: {
    name: 'Iceland',
    supported: true,
    url: (q) => `https://www.iceland.co.uk/search?q=${encodeURIComponent(q)}&format=json-extended`,
    method: 'GET',
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'accept': 'application/json'
    }
  },
  aldi: {
    name: 'Aldi',
    supported: false,
    reason: 'No UK online grocery platform — estimated data only (Click & Collect discontinued)'
  },
  lidl: {
    name: 'Lidl',
    supported: false,
    reason: 'No UK online grocery platform — in-store shopping only'
  }
};
