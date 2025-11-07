pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract ExamFHE is ZamaEthereumConfig {
    struct Exam {
        address studentAddress;
        euint32 encryptedScore;
        uint32 decryptedScore;
        bool isGraded;
        uint256 submissionTime;
    }

    mapping(string => Exam) private exams;
    string[] private examIds;

    event ExamSubmitted(string indexed examId, address indexed student);
    event ExamGraded(string indexed examId, uint32 score);

    constructor() ZamaEthereumConfig() {
        // Initialize contract with Zama configuration
    }

    function submitExam(
        string calldata examId,
        externalEuint32 encryptedScore,
        bytes calldata inputProof
    ) external {
        require(exams[examId].studentAddress == address(0), "Exam already submitted");

        euint32 encryptedValue = FHE.fromExternal(encryptedScore, inputProof);
        require(FHE.isInitialized(encryptedValue), "Invalid encrypted input");

        exams[examId] = Exam({
            studentAddress: msg.sender,
            encryptedScore: encryptedValue,
            decryptedScore: 0,
            isGraded: false,
            submissionTime: block.timestamp
        });

        FHE.allowThis(exams[examId].encryptedScore);
        FHE.makePubliclyDecryptable(exams[examId].encryptedScore);

        examIds.push(examId);

        emit ExamSubmitted(examId, msg.sender);
    }

    function gradeExam(
        string calldata examId,
        bytes memory abiEncodedScore,
        bytes memory decryptionProof
    ) external {
        require(exams[examId].studentAddress != address(0), "Exam does not exist");
        require(!exams[examId].isGraded, "Exam already graded");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(exams[examId].encryptedScore);

        FHE.checkSignatures(cts, abiEncodedScore, decryptionProof);

        uint32 decodedScore = abi.decode(abiEncodedScore, (uint32));
        require(decodedScore <= 100, "Invalid score value");

        exams[examId].decryptedScore = decodedScore;
        exams[examId].isGraded = true;

        emit ExamGraded(examId, decodedScore);
    }

    function getExamScore(string calldata examId) external view returns (uint32) {
        require(exams[examId].studentAddress != address(0), "Exam does not exist");
        require(exams[examId].isGraded, "Exam not graded yet");
        return exams[examId].decryptedScore;
    }

    function getEncryptedScore(string calldata examId) external view returns (euint32) {
        require(exams[examId].studentAddress != address(0), "Exam does not exist");
        return exams[examId].encryptedScore;
    }

    function getExamDetails(string calldata examId) external view returns (
        address studentAddress,
        uint32 decryptedScore,
        bool isGraded,
        uint256 submissionTime
    ) {
        require(exams[examId].studentAddress != address(0), "Exam does not exist");
        Exam storage exam = exams[examId];
        
        return (
            exam.studentAddress,
            exam.decryptedScore,
            exam.isGraded,
            exam.submissionTime
        );
    }

    function getAllExamIds() external view returns (string[] memory) {
        return examIds;
    }

    function isContractActive() public pure returns (bool) {
        return true;
    }
}


