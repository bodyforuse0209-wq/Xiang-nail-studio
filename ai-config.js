
/**
 * XIANG BEAUTY STUDIO
 * AI Nail Consultation Configuration
 * Version 1.0
 *
 * 此檔案不存放 API 金鑰或客戶個資。
 * 實際價格一律由原有計價系統計算。
 */

window.XIANG_AI_CONFIG = {
  version: "1.0",

  brand: {
    name: "香香村美妍製造所",
    englishName: "XIANG BEAUTY STUDIO",
    lineId: "@lry8774x",
    lineUrl: "https://line.me/R/ti/p/@lry8774x"
  },

  features: {
    imageRecognition: true,
    externalReferenceImages: true,
    artworkLibrary: true,
    customerFavorites: true,
    styleAnalytics: true,
    manualReview: true,
    onlineBooking: false
  },

  styles: [
    { id: "minimal", name: "極簡日常" },
    { id: "street", name: "潮流圖騰" },
    { id: "dark", name: "暗黑金屬" },
    { id: "fan", name: "應援客製" }
  ],

  recognition: {
    elements: [
      "單色",
      "貓眼",
      "鏡面",
      "法式",
      "漸層",
      "暈染",
      "手繪",
      "線條",
      "貼紙",
      "水鑽",
      "金屬飾品",
      "立體造型",
      "文字",
      "Logo",
      "角色圖案"
    ],

    difficultyLevels: [
      "simple",
      "moderate",
      "complex",
      "unknown"
    ],

    requireManualReview: [
      "complex",
      "unknown"
    ]
  },

  pricing: {
    source: "existing-quote-engine",
    allowAIGeneratedPrices: false,
    allowUnknownPrice: false,
    requireCustomerConfirmation: true
  },

  consultation: {
    bookingMode: "LINE_MANUAL",
    allowPriceOnly: true,
    requireBooking: false,
    includeSelectedStyles: true,
    includeReferenceImages: true,
    includeQuoteSummary: true,

    manualReviewMessage:
      "這款設計細節比較豐富，AI 暫時無法準確估價。" +
      "歡迎將照片傳給香香村，由我們人工協助確認。" +
      "只是想先了解價格也完全沒問題唷！"
  },

  analytics: {
    trackViews: true,
    trackFavorites: true,
    trackSearches: true,
    trackQuoteRequests: true,
    trackBookings: false,
    requireConsentForPersonalTracking: true
  }
};

Object.freeze(window.XIANG_AI_CONFIG);
