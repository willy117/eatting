import { GoogleGenAI } from "@google/genai";
import { Restaurant, GeoLocation, PriceLevel, DistanceRange } from "../types";

// Initialize Gemini Client
const apiKey = process.env.API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export const fetchRecommendations = async (
  location: GeoLocation,
  category: string,
  price: PriceLevel,
  distance: DistanceRange
): Promise<Restaurant[]> => {
  
  if (!apiKey) {
    throw new Error("API Key 未設定。請檢查 GitHub Secrets 設定。");
  }

  const modelId = "gemini-2.5-flash";
  
  // Construct a prompt that encourages structured output
  const prompt = `
    I am at Latitude: ${location.lat}, Longitude: ${location.lng}.
    Please recommend exactly 5 real restaurants nearby based on your knowledge.
    
    Filters:
    - Cuisine/Category: ${category === 'anything' ? 'Any popular food' : category}
    - Budget/Price Level: ${price}
    - Max Distance: ${distance}
    
    Instructions:
    1. Recommend real, existing restaurants near the coordinates.
    2. Return the response as a list of 5 items.
    3. **The response content MUST be in Traditional Chinese (Taiwan).**
    4. For each item, strictly follow this text format on a new line:
       "NAME | CUISINE | PRICE_ESTIMATE | RATING | ONE_SENTENCE_DESCRIPTION"
    5. Example line: "鼎泰豐 | 麵食點心 | $$ | 4.5 | 小籠包皮薄餡多，是台灣必吃的排隊美食。"
    6. Ensure the places are currently operating or suitable for dining now.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      // Removed tools: [{ googleMaps: {} }] to prevent permission errors
    });

    const text = response.text || "";
    
    // Parse the text response
    const lines = text.split('\n').filter(line => line.includes('|'));
    
    const restaurants: Restaurant[] = lines.slice(0, 5).map((line, index) => {
      const parts = line.split('|').map(s => s.trim());
      
      const name = parts[0]?.replace(/^\d+\.\s*/, '').replace(/\*/g, '') || "未知餐廳";
      const cuisine = parts[1] || "美食";
      const priceLevel = parts[2] || "$";
      const rating = parts[3] || "4.0";
      const description = parts[4] || "暫無描述。";

      // Manually construct Google Maps Search URL
      // This ensures the link works without needing the Grounding API
      const mapUri = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + " " + location.lat + "," + location.lng)}`;

      return {
        id: `rest-${index}-${Date.now()}`,
        name,
        cuisine,
        priceLevel,
        rating,
        description,
        mapUri
      };
    });

    if (restaurants.length === 0) {
      console.warn("No restaurants parsed from:", text);
      throw new Error("無法解析 AI 回傳的資料");
    }

    return restaurants;

  } catch (error: any) {
    console.error("Error fetching recommendations:", error);
    // Throw a more descriptive error
    if (error.message?.includes("400")) throw new Error("API 請求無效 (400)");
    if (error.message?.includes("403")) throw new Error("API Key 權限不足 (403)");
    if (error.message?.includes("429")) throw new Error("API 請求次數過多 (429)");
    throw error;
  }
};