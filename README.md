# Confidential Academic Testing

Confidential Academic Testing is a privacy-preserving examination system that utilizes Zama's Fully Homomorphic Encryption (FHE) technology. This application allows for secure answer submission and automated grading, ensuring that student grades remain confidential and protected from potential leakage by educators or platforms. 

## The Problem

In traditional online examination systems, submitted answers and resulting grades can be exposed to unauthorized personnel, leading to potential breaches of privacy and unfair academic outcomes. Cleartext data in these systems poses significant risks, including data interception, unauthorized access, and manipulation of examination results, which can severely impact students' academic integrity and fairness.

## The Zama FHE Solution

Zama's Fully Homomorphic Encryption technology addresses these challenges by enabling computation on encrypted data. This means that even while grades and answers are encrypted, the system can still process and evaluate them without ever exposing the underlying information. Using fhevm, we can efficiently handle encrypted inputs, ensuring robust privacy protections throughout the examination process.

## Key Features

- 🔒 **End-to-End Encryption:** All answers submitted by students are encrypted, keeping their responses secure.
- 🤖 **Automated Grading:** The system performs grading using homomorphic computations, allowing for accurate assessments while maintaining confidentiality.
- 📊 **Grade Privacy:** Students' grades are never revealed in cleartext, protecting their academic performance from unauthorized viewing.
- 🎓 **Fairness in Education:** By safeguarding student data, the application promotes fairness and trust in the educational evaluation process.
- 🌍 **Accessible Everywhere:** The web-based application can be utilized across different devices, ensuring accessibility for all students.

## Technical Architecture & Stack

The technical architecture is built around Zama's robust cryptographic framework, leveraging the following technologies:

- **Core Privacy Engine:** Zama (fhevm)
- **Programming Language:** Rust (for low-level efficiency)
- **Frontend Framework:** React
- **Backend Framework:** Node.js
- **Database:** PostgreSQL

## Smart Contract / Core Logic

Here’s a simplified pseudo-code example demonstrating how the grading logic might be implemented using Zama’s technology:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import "TFHE.sol";

contract ExamFHE {
    // Store encrypted answers
    mapping(address => bytes) public encryptedAnswers;

    function submitAnswer(bytes memory encryptedAnswer) public {
        encryptedAnswers[msg.sender] = encryptedAnswer;
    }

    function gradeExam() public view returns (uint64) {
        uint64 totalScore = 0;
        for (uint i = 0; i < encryptedAnswers.length; i++) {
            totalScore += TFHE.decrypt(encryptedAnswers[i]);
        }
        return totalScore;
    }
}
```

In this example, student answers are submitted as encrypted data and can be graded without exposing the original information.

## Directory Structure

```plaintext
.
├── contracts
│   └── Exam_FHE.sol
├── scripts
│   ├── submit_answer.py
│   └── grade_exam.py
├── tests
│   ├── test_exam_fhe.py
└── README.md
```

## Installation & Setup

### Prerequisites

To get started, you'll need to have the following installed on your machine:

- Node.js (for the backend)
- Python 3.x (for the grading scripts)
- PostgreSQL (for database management)

### Install Dependencies

Install the required dependencies using the commands below:

For Node.js:
```bash
npm install express
npm install body-parser
npm install fhevm
```

For Python:
```bash
pip install concrete-ml
```

## Build & Run

To build and run the application, follow these steps:

1. **Compile smart contracts** (if applicable):
   ```bash
   npx hardhat compile
   ```

2. **Start the backend server**:
   ```bash
   node server.js
   ```

3. **Run the grading script**:
   ```bash
   python grade_exam.py
   ```

## Acknowledgements

This project is made possible by Zama, providing the open-source Fully Homomorphic Encryption primitives that enable secure and privacy-preserving computation. Their technology empowers developers to build innovative applications like Confidential Academic Testing that prioritize user privacy and data integrity.

For further exploration of Zama's FHE technologies and their applications, developers can engage with the growing community and deepen their understanding of secure computation.


