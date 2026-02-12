export type PredictPeriods = {
  week1: number;
  week2: number;
  week3: number;
  week4: number;
};

export type ProductPrediction = {
  product_id: string;
  image: string;
  title: string;
  stock: number;
  price: string;
  predited_total_stock: number;
  predict_periods: PredictPeriods;
};
