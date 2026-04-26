export interface ParentChallenge {
  prompt: string;
  answer: number;
}

export class ParentGateChallenge {
  private unlocked = false;

  createChallenge(): ParentChallenge {
    const left = this.randomInt(11, 29);
    const right = this.randomInt(7, 19);

    return {
      prompt: `${left} + ${right}`,
      answer: left + right,
    };
  }

  verifyAnswer(challenge: ParentChallenge, submittedAnswer: number): boolean {
    const passed = Number.isFinite(submittedAnswer) && submittedAnswer === challenge.answer;
    this.unlocked = passed;
    return passed;
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  reset(): void {
    this.unlocked = false;
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
