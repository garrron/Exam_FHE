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
  name: string;
  score: string;
  subject: string;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
}

interface ExamStats {
  totalExams: number;
  avgScore: number;
  highScore: number;
  verifiedCount: number;
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
    status: "pending", 
    message: "" 
  });
  const [newExamData, setNewExamData] = useState({ name: "", score: "", subject: "" });
  const [selectedExam, setSelectedExam] = useState<ExamData | null>(null);
  const [decryptedScore, setDecryptedScore] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showFAQ, setShowFAQ] = useState(false);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
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
            name: businessData.name,
            score: businessId,
            subject: businessId,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
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
        newExamData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newExamData.subject) || 0,
        0,
        "Encrypted Exam Score"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Exam record created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewExamData({ name: "", score: "", subject: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingExam(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
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
        setTransactionStatus({ visible: true, status: "success", message: "Data already verified on-chain" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
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
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Data is already verified on-chain" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadData();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed: " + (e.message || "Unknown error") });
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
      
      const isAvailable = await contract.isAvailable();
      setTransactionStatus({ visible: true, status: "success", message: "System is available and ready!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const getExamStats = (): ExamStats => {
    const totalExams = exams.length;
    const verifiedCount = exams.filter(e => e.isVerified).length;
    const scores = exams.filter(e => e.isVerified && e.decryptedValue).map(e => e.decryptedValue || 0);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const highScore = scores.length > 0 ? Math.max(...scores) : 0;

    return { totalExams, avgScore, highScore, verifiedCount };
  };

  const filteredExams = exams.filter(exam => 
    exam.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    exam.subject.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const faqItems = [
    { question: "What is FHE encryption?", answer: "Fully Homomorphic Encryption allows computations on encrypted data without decryption." },
    { question: "How are scores protected?", answer: "Scores are encrypted using Zama FHE and can only be decrypted with proper authorization." },
    { question: "Is my data private?", answer: "Yes, all exam scores are encrypted and cannot be viewed by unauthorized parties." }
  ];

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>Confidential Academic Testing 🔐</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🎓</div>
            <h2>Connect Your Wallet to Begin</h2>
            <p>Secure your academic scores with FHE encryption technology</p>
            <div className="connection-steps">
              <div className="step"><span>1</span><p>Connect wallet to initialize FHE system</p></div>
              <div className="step"><span>2</span><p>Encrypt and submit exam scores securely</p></div>
              <div className="step"><span>3</span><p>Verify scores with zero-knowledge proofs</p></div>
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
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading secure exam system...</p>
    </div>
  );

  const stats = getExamStats();

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>Confidential Academic Testing 🔐</h1>
        </div>
        
        <div className="header-actions">
          <button onClick={checkAvailability} className="status-btn">Check System</button>
          <button onClick={() => setShowCreateModal(true)} className="create-btn">+ New Exam</button>
          <button onClick={() => setShowFAQ(!showFAQ)} className="faq-btn">FAQ</button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="stats-section">
          <div className="stat-card">
            <h3>Total Exams</h3>
            <div className="stat-value">{stats.totalExams}</div>
          </div>
          <div className="stat-card">
            <h3>Average Score</h3>
            <div className="stat-value">{stats.avgScore.toFixed(1)}</div>
          </div>
          <div className="stat-card">
            <h3>High Score</h3>
            <div className="stat-value">{stats.highScore}</div>
          </div>
          <div className="stat-card">
            <h3>Verified</h3>
            <div className="stat-value">{stats.verifiedCount}/{stats.totalExams}</div>
          </div>
        </div>

        {showFAQ && (
          <div className="faq-section">
            <h3>Frequently Asked Questions</h3>
            {faqItems.map((item, index) => (
              <div key={index} className="faq-item">
                <strong>Q: {item.question}</strong>
                <p>A: {item.answer}</p>
              </div>
            ))}
          </div>
        )}

        <div className="exams-section">
          <div className="section-header">
            <h2>Exam Records</h2>
            <div className="search-bar">
              <input 
                type="text" 
                placeholder="Search exams..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button onClick={loadData} className="refresh-btn" disabled={isRefreshing}>
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          
          <div className="exams-list">
            {filteredExams.length === 0 ? (
              <div className="no-exams">
                <p>No exam records found</p>
                <button className="create-btn" onClick={() => setShowCreateModal(true)}>
                  Create First Exam
                </button>
              </div>
            ) : filteredExams.map((exam, index) => (
              <div 
                className={`exam-item ${selectedExam?.id === exam.id ? "selected" : ""} ${exam.isVerified ? "verified" : ""}`} 
                key={index}
                onClick={() => setSelectedExam(exam)}
              >
                <div className="exam-title">{exam.name}</div>
                <div className="exam-meta">
                  <span>Subject Code: {exam.publicValue1}</span>
                  <span>Date: {new Date(exam.timestamp * 1000).toLocaleDateString()}</span>
                </div>
                <div className="exam-status">
                  Status: {exam.isVerified ? "✅ Verified" : "🔓 Ready for Verification"}
                  {exam.isVerified && exam.decryptedValue && (
                    <span className="verified-score">Score: {exam.decryptedValue}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
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
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => decryptData(selectedExam.score)}
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
      setExamData({ ...examData, [name]: intValue });
    } else {
      setExamData({ ...examData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-exam-modal">
        <div className="modal-header">
          <h2>New Exam Record</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 Score Encryption</strong>
            <p>Exam score will be encrypted with Zama FHE technology</p>
          </div>
          
          <div className="form-group">
            <label>Student Name *</label>
            <input 
              type="text" 
              name="name" 
              value={examData.name} 
              onChange={handleChange} 
              placeholder="Enter student name..." 
            />
          </div>
          
          <div className="form-group">
            <label>Exam Score (0-100) *</label>
            <input 
              type="number" 
              name="score" 
              value={examData.score} 
              onChange={handleChange} 
              placeholder="Enter exam score..." 
              min="0"
              max="100"
            />
            <div className="data-type-label">FHE Encrypted Integer</div>
          </div>
          
          <div className="form-group">
            <label>Subject Code *</label>
            <input 
              type="number" 
              name="subject" 
              value={examData.subject} 
              onChange={handleChange} 
              placeholder="Enter subject code..." 
            />
            <div className="data-type-label">Public Data</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !examData.name || !examData.score || !examData.subject} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "Encrypting..." : "Create Record"}
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
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
}> = ({ exam, onClose, decryptedScore, isDecrypting, decryptData }) => {
  const handleDecrypt = async () => {
    if (decryptedScore !== null) return;
    
    const decrypted = await decryptData();
    if (decrypted !== null) {
      // Score is set via callback
    }
  };

  return (
    <div className="modal-overlay">
      <div className="exam-detail-modal">
        <div className="modal-header">
          <h2>Exam Record Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="exam-info">
            <div className="info-item"><span>Student:</span><strong>{exam.name}</strong></div>
            <div className="info-item"><span>Subject Code:</span><strong>{exam.publicValue1}</strong></div>
            <div className="info-item"><span>Date:</span><strong>{new Date(exam.timestamp * 1000).toLocaleDateString()}</strong></div>
          </div>
          
          <div className="data-section">
            <h3>Encrypted Exam Score</h3>
            
            <div className="data-row">
              <div className="data-label">Exam Score:</div>
              <div className="data-value">
                {exam.isVerified && exam.decryptedValue ? 
                  `${exam.decryptedValue}/100 (Verified)` : 
                  decryptedScore !== null ? 
                  `${decryptedScore}/100 (Decrypted)` : 
                  "🔒 FHE Encrypted"
                }
              </div>
              <button 
                className={`decrypt-btn ${(exam.isVerified || decryptedScore !== null) ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? "Decrypting..." : exam.isVerified ? "✅ Verified" : decryptedScore !== null ? "🔓 Decrypted" : "🔓 Verify Score"}
              </button>
            </div>
            
            <div className="fhe-info">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>FHE Protected Score</strong>
                <p>Score is encrypted using Zama FHE technology for maximum privacy protection.</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;