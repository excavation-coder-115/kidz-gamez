export interface ParentChallenge {
  prompt: string;
  answer: number;
}

export class ParentGateChallenge {
  private unlocked = false;
  private currentChallenge: ParentChallenge | null = null;

  createChallenge(): ParentChallenge {
    const left = this.randomInt(11, 29);
    const right = this.randomInt(7, 19);

    const challenge = {
      prompt: `${left} + ${right}`,
      answer: left + right,
    };

    this.currentChallenge = { ...challenge };
    this.unlocked = false;

    return { ...challenge };
  }

  verifyAnswer(_challenge: ParentChallenge, submittedAnswer: number): boolean {
    const expectedAnswer = this.currentChallenge?.answer;
    const passed =
      Number.isFinite(submittedAnswer) &&
      Number.isFinite(expectedAnswer) &&
      submittedAnswer === expectedAnswer;
    this.unlocked = passed;

    if (passed) {
      this.currentChallenge = null;
    }

    return passed;
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  reset(): void {
    this.unlocked = false;
    this.currentChallenge = null;
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
