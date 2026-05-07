import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Razorpay from 'razorpay';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';
const razorpay = razorpayKeyId && razorpayKeySecret
  ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret })
  : null;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'VSYK Chits Backend is running!' });
});

app.post('/api/payments/razorpay/order', async (req: Request, res: Response) => {
  try {
    if (!razorpay) {
      return res.status(500).json({ error: 'Razorpay keys are not configured.' });
    }

    const { amount, currency = 'INR', receipt, notes } = req.body ?? {};
    const parsedAmount = Number(amount);

    if (!parsedAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount.' });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(parsedAmount),
      currency,
      receipt,
      notes,
    });

    return res.json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      keyId: razorpayKeyId,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to create order.' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
