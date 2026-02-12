import { NextResponse } from "next/server";
import { ApiResponse, Product } from "@shared/types/product";

const API_URL = "https://api.pinar.retter.io/3cn87h0si/CALL/Order/getHackathonOrders";
const API_KEY = "aws-hackathon";

export async function GET() {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": API_KEY,
        "Content-Type": "application/json",
      },
    });

    const json: ApiResponse = await res.json();

    const productMap = new Map<string, Product>();
    for (const order of json.data) {
      for (const p of order.products) {
        if (!productMap.has(p.id)) {
          productMap.set(p.id, {
            product_id: p.id,
            image: p.image,
            title: p.name,
            stock: p.stockQuantity,
            price: p.price.toFixed(2),
          });
        }
      }
    }

    return NextResponse.json(Array.from(productMap.values()));
  } catch (err) {
    console.error("Failed to fetch products:", err);
    return NextResponse.json([], { status: 500 });
  }
}
