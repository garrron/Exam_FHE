import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface ExamData {
  id: number;
  subject: string;
  studentId: string;
  encryptedScore: string;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
}

interface ExamStats {
  totalExams: number;
  averageScore: number;
  passRate: number;
  highScores: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<ExamData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingExam, setCreatingExam] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending" as const, 
    message: "" 
  });
  const [newExamData, setNewExamData] = useState({ subject: "", studentId: "", score: "" });
  const [selectedExam, setSelectedExam] = useState<ExamData | null>(null);
  const [decryptedScore, setDecryptedScore] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [faqOpen, setFaqOpen] = useState(false);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting} = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const examsList: ExamData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          examsList.push({
            id: parseInt(businessId.replace('exam-', '')) || Date.now(),
            subject: businessData.name,
            studentId: businessId,
            encryptedScore: businessId,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading exam data:', e);
        }
      }
      
      setExams(examsList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createExam = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingExam(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating exam record with FHE encryption..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const scoreValue = parseInt(newExamData.score) || 0;
      const businessId = `exam-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, scoreValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newExamData.subject,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newExamData.studentId) || 0,
        0,
        "Encrypted Exam Score"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Encrypting and storing on blockchain..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Exam record created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewExamData({ subject: "", studentId: "", score: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingExam(false); 
    }
  };

  const decryptScore = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Score already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Score decrypted and verified successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Score is already verified" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Decryption failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const available = await contract.isAvailable();
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: "FHE system is available and ready!" 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const calculateStats = (): ExamStats => {
    const totalExams = exams.length;
    const verifiedExams = exams.filter(e => e.isVerified);
    const totalScore = verifiedExams.reduce((sum, exam) => sum + (exam.decryptedValue || 0), 0);
    const averageScore = totalExams > 0 ? totalScore / verifiedExams.length : 0;
    const passRate = totalExams > 0 ? (verifiedExams.filter(e => (e.decryptedValue || 0) >= 60).length / verifiedExams.length) * 100 : 0;
    const highScores = verifiedExams.filter(e => (e.decryptedValue || 0) >= 90).length;

    return {
      totalExams,
      averageScore: Math.round(averageScore * 10) / 10,
      passRate: Math.round(passRate * 10) / 10,
      highScores
    };
  };

  const filteredExams = exams.filter(exam => 
    exam.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
    exam.studentId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = calculateStats();

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>🔐 FHE Exam System</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🎓</div>
            <h2>Connect Wallet to Access Encrypted Exams</h2>
            <p>Secure academic testing with fully homomorphic encryption for privacy protection</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect your wallet to initialize FHE system</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>Encrypt exam scores with Zama FHE technology</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Automatically grade while keeping data private</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
        <p className="loading-note">Securing exam data with homomorphic encryption</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading encrypted exam system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>🎓 FHE Exam System</h1>
          <p>Privacy-Preserving Academic Testing</p>
        </div>
        
        <div className="header-actions">
          <button onClick={checkAvailability} className="status-btn">
            Check System
          </button>
          <button onClick={() => setShowCreateModal(true)} className="create-btn">
            + New Exam
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="stats-panels">
          <div className="stat-panel">
            <div className="stat-icon">📊</div>
            <div className="stat-content">
              <h3>Total Exams</h3>
              <div className="stat-value">{stats.totalExams}</div>
            </div>
          </div>
          
          <div className="stat-panel">
            <div className="stat-icon">⭐</div>
            <div className="stat-content">
              <h3>Average Score</h3>
              <div className="stat-value">{stats.averageScore}</div>
            </div>
          </div>
          
          <div className="stat-panel">
            <div className="stat-icon">✅</div>
            <div className="stat-content">
              <h3>Pass Rate</h3>
              <div className="stat-value">{stats.passRate}%</div>
            </div>
          </div>
          
          <div className="stat-panel">
            <div className="stat-icon">🏆</div>
            <div className="stat-content">
              <h3>High Scores</h3>
              <div className="stat-value">{stats.highScores}</div>
            </div>
          </div>
        </div>

        <div className="search-section">
          <div className="search-box">
            <input 
              type="text" 
              placeholder="Search exams by subject or student ID..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button onClick={loadData} disabled={isRefreshing}>
              {isRefreshing ? "🔄" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="exams-section">
          <h2>Encrypted Exam Records</h2>
          <div className="exams-grid">
            {filteredExams.length === 0 ? (
              <div className="no-exams">
                <p>No exam records found</p>
                <button onClick={() => setShowCreateModal(true)} className="create-btn">
                  Create First Exam
                </button>
              </div>
            ) : filteredExams.map((exam, index) => (
              <div 
                className={`exam-card ${exam.isVerified ? "verified" : ""}`}
                key={index}
                onClick={() => setSelectedExam(exam)}
              >
                <div className="exam-header">
                  <h3>{exam.subject}</h3>
                  <span className={`status ${exam.isVerified ? "verified" : "encrypted"}`}>
                    {exam.isVerified ? "✅ Verified" : "🔒 Encrypted"}
                  </span>
                </div>
                <div className="exam-details">
                  <p>Student ID: {exam.publicValue1}</p>
                  <p>Date: {new Date(exam.timestamp * 1000).toLocaleDateString()}</p>
                  {exam.isVerified && exam.decryptedValue && (
                    <p className="score">Score: {exam.decryptedValue}/100</p>
                  )}
                </div>
                <div className="exam-creator">
                  Teacher: {exam.creator.substring(0, 8)}...
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="faq-section">
          <div className="faq-header" onClick={() => setFaqOpen(!faqOpen)}>
            <h3>FHE Exam System FAQ</h3>
            <span>{faqOpen ? "−" : "+"}</span>
          </div>
          {faqOpen && (
            <div className="faq-content">
              <div className="faq-item">
                <h4>How does FHE protect my exam scores?</h4>
                <p>Scores are encrypted using Fully Homomorphic Encryption, allowing automatic grading without revealing actual scores to anyone.</p>
              </div>
              <div className="faq-item">
                <h4>Who can see my decrypted scores?</h4>
                <p>Only authorized parties with decryption keys can view scores after on-chain verification.</p>
              </div>
              <div className="faq-item">
                <h4>Is the system secure?</h4>
                <p>Yes, Zama FHE technology ensures mathematical security while enabling computations on encrypted data.</p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreateExam 
          onSubmit={createExam} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingExam} 
          examData={newExamData} 
          setExamData={setNewExamData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedExam && (
        <ExamDetailModal 
          exam={selectedExam} 
          onClose={() => { 
            setSelectedExam(null); 
            setDecryptedScore(null); 
          }} 
          decryptedScore={decryptedScore} 
          setDecryptedScore={setDecryptedScore} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => decryptScore(selectedExam.studentId)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ModalCreateExam: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  examData: any;
  setExamData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, examData, setExamData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'score') {
      const intValue = value.replace(/[^\d]/g, '');
      setExamData({ ...examData, [name]: Math.min(100, parseInt(intValue) || 0) });
    } else {
      setExamData({ ...examData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-exam-modal">
        <div className="modal-header">
          <h2>Create New Exam Record</h2>
          <button onClick={onClose} className="close-modal">×</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 Protection</strong>
            <p>Exam scores are encrypted using Zama FHE technology</p>
          </div>
          
          <div className="form-group">
            <label>Subject *</label>
            <input 
              type="text" 
              name="subject" 
              value={examData.subject} 
              onChange={handleChange} 
              placeholder="Mathematics, Physics, etc." 
            />
          </div>
          
          <div className="form-group">
            <label>Student ID *</label>
            <input 
              type="number" 
              name="studentId" 
              value={examData.studentId} 
              onChange={handleChange} 
              placeholder="Enter student ID" 
            />
          </div>
          
          <div className="form-group">
            <label>Exam Score (0-100) *</label>
            <input 
              type="number" 
              name="score" 
              value={examData.score} 
              onChange={handleChange} 
              min="0"
              max="100"
              placeholder="Enter score (0-100)" 
            />
            <div className="data-type-label">FHE Encrypted Integer</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !examData.subject || !examData.studentId || !examData.score} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "🔐 Encrypting..." : "Create Exam Record"}
          </button>
        </div>
      </div>
    </div>
  );
};

const ExamDetailModal: React.FC<{
  exam: ExamData;
  onClose: () => void;
  decryptedScore: number | null;
  setDecryptedScore: (value: number | null) => void;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
}> = ({ exam, onClose, decryptedScore, setDecryptedScore, isDecrypting, decryptData }) => {
  const handleDecrypt = async () => {
    if (decryptedScore !== null) { 
      setDecryptedScore(null); 
      return; 
    }
    
    const decrypted = await decryptData();
    if (decrypted !== null) {
      setDecryptedScore(decrypted);
    }
  };

  const getGrade = (score: number) => {
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    if (score >= 60) return "D";
    return "F";
  };

  const score = exam.isVerified ? (exam.decryptedValue || 0) : (decryptedScore || 0);
  const showScore = exam.isVerified || decryptedScore !== null;

  return (
    <div className="modal-overlay">
      <div className="exam-detail-modal">
        <div className="modal-header">
          <h2>Exam Details</h2>
          <button onClick={onClose} className="close-modal">×</button>
        </div>
        
        <div className="modal-body">
          <div className="exam-info">
            <div className="info-row">
              <span>Subject:</span>
              <strong>{exam.subject}</strong>
            </div>
            <div className="info-row">
              <span>Student ID:</span>
              <strong>{exam.publicValue1}</strong>
            </div>
            <div className="info-row">
              <span>Teacher:</span>
              <strong>{exam.creator.substring(0, 8)}...{exam.creator.substring(38)}</strong>
            </div>
            <div className="info-row">
              <span>Date:</span>
              <strong>{new Date(exam.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
          </div>
          
          <div className="score-section">
            <h3>Exam Score</h3>
            <div className="score-display">
              {showScore ? (
                <div className="score-result">
                  <div className="score-number">{score}/100</div>
                  <div className="score-grade">Grade: {getGrade(score)}</div>
                  <div className="score-status">
                    {exam.isVerified ? "✅ On-chain Verified" : "🔓 Locally Decrypted"}
                  </div>
                </div>
              ) : (
                <div className="encrypted-score">
                  <div className="encrypted-icon">🔒</div>
                  <div>Score Encrypted with FHE</div>
                  <div className="encrypted-text">Homomorphically graded and secured</div>
                </div>
              )}
            </div>
            
            <button 
              className={`decrypt-btn ${showScore ? 'decrypted' : ''}`}
              onClick={handleDecrypt} 
              disabled={isDecrypting}
            >
              {isDecrypting ? "🔓 Decrypting..." : 
               exam.isVerified ? "✅ Verified" : 
               decryptedScore !== null ? "🔄 Re-verify" : 
               "🔓 Decrypt Score"}
            </button>
          </div>
          
          <div className="fhe-explanation">
            <h4>FHE Protection Process</h4>
            <div className="process-steps">
              <div className="step">
                <span>1</span>
                <p>Score encrypted using Zama FHE before submission</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>Automatic homomorphic grading on encrypted data</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Secure decryption with on-chain verification</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
          {!exam.isVerified && (
            <button 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
              className="verify-btn"
            >
              {isDecrypting ? "Verifying..." : "Verify on-chain"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;


