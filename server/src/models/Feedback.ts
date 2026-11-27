import mongoose, { type HydratedDocument, type InferSchemaType } from 'mongoose';

const feedbackSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: {
      type: String,
      required: [true, 'Write your feedback first.'],
      trim: true,
      maxlength: [2000, 'Feedback can be at most 2000 characters.'],
    },
  },
  { timestamps: true },
);

export const Feedback = mongoose.model('Feedback', feedbackSchema);

export type FeedbackData = InferSchemaType<typeof feedbackSchema>;
export type FeedbackDoc = HydratedDocument<FeedbackData>;
