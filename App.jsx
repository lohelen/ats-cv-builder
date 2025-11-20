import React, { useState, useEffect } from 'react';
import { Upload, FileText, Target, MessageSquare, ArrowRight, Download, CheckCircle, Loader, AlertTriangle, User, LogOut } from 'lucide-react';

// 配置
const N8N_BASE_URL = 'https://lohelen24.app.n8n.cloud/webhook';

export default function ATSAnalyzerApp() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // 用戶狀態 (先用簡單的 localStorage，之後整合 Supabase)
  const [user, setUser] = useState(null);
  const [loginEmail, setLoginEmail] = useState('');
  
  // CV 和 JD
  const [cvFile, setCvFile] = useState(null);
  const [cvText, setCvText] = useState('');
  const [jdText, setJdText] = useState('');
  
  // 分析結果
  const [atsResult, setAtsResult] = useState(null);
  const [optimizedCV, setOptimizedCV] = useState('');
  const [interviewQuestions, setInterviewQuestions] = useState(null);

  // 檢查登入狀態
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  // 簡單的登入 (之後替換成 Supabase Auth)
  const handleLogin = () => {
    if (loginEmail) {
      const userData = { id: Date.now().toString(), email: loginEmail };
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
    resetAll();
  };

  // PDF 轉文字處理
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setCvFile(file);
    setError(null);

    // 檢查文件大小 (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('文件太大，請上傳小於 5MB 的文件');
      return;
    }

    try {
      if (file.type === 'application/pdf') {
        setLoading(true);
        setError('正在處理 PDF，請稍候...');
        
        try {
          // 檢查 PDF.js 是否已載入
          if (typeof window.pdfjsLib === 'undefined') {
            throw new Error('PDF.js 尚未載入完成，請重新整理頁面後再試');
          }
          
          // 設定 Worker
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          
          const arrayBuffer = await file.arrayBuffer();
          const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          
          let fullText = '';
          
          // 提取每一頁的文字
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n\n';
          }
          
          if (fullText.trim().length < 50) {
            throw new Error('PDF 中提取的文字太少（少於 50 字），請確認 PDF 是否包含可選取的文字');
          }
          
          setCvText(fullText.trim());
          setError(null);
        } catch (pdfError) {
          setError(`PDF 處理失敗: ${pdfError.message}. 請改用 .txt 文件或複製貼上文字`);
        } finally {
          setLoading(false);
        }
      } else if (file.type === 'text/plain') {
        const reader = new FileReader();
        reader.onload = (event) => {
          setCvText(event.target.result);
        };
        reader.onerror = () => {
          setError('文件讀取失敗');
        };
        reader.readAsText(file);
      } else {
        setError('請上傳 .txt 或 .pdf 文件');
      }
    } catch (err) {
      setError(`文件處理失敗: ${err.message}`);
    }
  };

  // 調用 n8n API 的通用函數
  const callN8NAPI = async (endpoint, data) => {
    try {
      const response = await fetch(`${N8N_BASE_URL}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          userId: user?.id || 'anonymous'
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || '請求失敗');
      }

      return result;
    } catch (err) {
      throw new Error(err.message || '網路請求失敗');
    }
  };

  // 1. ATS 分析
  const analyzeATS = async () => {
    if (!cvText || !jdText) {
      setError('請填寫履歷和職位描述');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await callN8NAPI('ats-analysis', {
        cv: cvText,
        jobDescription: jdText
      });

      setAtsResult(result.data);
      setStep(2);
    } catch (err) {
      setError(`分析失敗: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 2. CV 優化
  const optimizeCV = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await callN8NAPI('optimize-cv', {
        cv: cvText,
        jobDescription: jdText,
        missingKeywords: atsResult?.missingKeywords || []
      });

      setOptimizedCV(result.data.optimizedCV);
      setStep(3);
    } catch (err) {
      setError(`優化失敗: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 3. 生成面試問題
  const generateInterviewQuestions = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await callN8NAPI('interview-questions', {
        cv: optimizedCV || cvText,
        jobDescription: jdText
      });

      setInterviewQuestions(result.data);
      setStep(4);
    } catch (err) {
      setError(`生成失敗: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 下載優化後的 CV
  const downloadOptimizedCV = () => {
    const blob = new Blob([optimizedCV], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `optimized_cv_${new Date().getTime()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 重置所有狀態
  const resetAll = () => {
    setStep(1);
    setCvText('');
    setJdText('');
    setCvFile(null);
    setAtsResult(null);
    setOptimizedCV('');
    setInterviewQuestions(null);
    setError(null);
  };

  // 如果未登入，顯示登入頁面
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <User className="mx-auto mb-4 text-blue-600" size={48} />
            <h2 className="text-2xl font-bold text-gray-800">歡迎使用 AI CV 優化系統</h2>
            <p className="text-gray-600 mt-2">請登入以開始使用</p>
          </div>
          <div>
            <input
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder="輸入你的 Email"
              className="w-full px-4 py-3 border rounded-lg mb-4 focus:ring-2 focus:ring-blue-500"
              onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
            />
            <button
              onClick={handleLogin}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700"
            >
              登入
            </button>
          </div>
          <p className="text-xs text-gray-500 text-center mt-4">
            這是簡化版登入，完整版將整合 Supabase
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-800">AI CV 優化系統</h1>
            <p className="text-gray-600">分析 ATS 分數 • 優化關鍵字 • 準備面試</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-gray-600">已登入</p>
              <p className="font-medium text-gray-800">{user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 flex items-center gap-2"
            >
              <LogOut size={18} />
              登出
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
            <AlertTriangle className="text-red-600 mr-3 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="text-red-800 font-medium">錯誤</p>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Progress Steps */}
        <div className="flex justify-center mb-8">
          {[
            { num: 1, label: '上傳文件', icon: Upload },
            { num: 2, label: 'ATS 分析', icon: Target },
            { num: 3, label: 'CV 優化', icon: FileText },
            { num: 4, label: '面試準備', icon: MessageSquare }
          ].map((s, idx) => (
            <div key={s.num} className="flex items-center">
              <div className={`flex flex-col items-center ${step >= s.num ? 'text-blue-600' : 'text-gray-400'}`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  step >= s.num ? 'bg-blue-600 text-white' : 'bg-gray-300'
                }`}>
                  {step > s.num ? <CheckCircle size={24} /> : <s.icon size={24} />}
                </div>
                <span className="text-xs mt-2 font-medium">{s.label}</span>
              </div>
              {idx < 3 && (
                <div className={`w-16 h-1 mx-2 ${step > s.num ? 'bg-blue-600' : 'bg-gray-300'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-bold mb-6">上傳你的履歷和職位描述</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  上傳履歷 (CV)
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition cursor-pointer">
                  <input
                    type="file"
                    onChange={handleFileUpload}
                    accept=".txt,.pdf"
                    className="hidden"
                    id="cv-upload"
                  />
                  <label htmlFor="cv-upload" className="cursor-pointer">
                    <Upload className="mx-auto mb-2 text-gray-400" size={32} />
                    <p className="text-sm text-gray-600">
                      {cvFile ? cvFile.name : '點擊上傳 TXT 或 PDF 文件'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">最大 5MB</p>
                  </label>
                </div>
                <textarea
                  value={cvText}
                  onChange={(e) => setCvText(e.target.value)}
                  placeholder="或直接貼上履歷內容..."
                  className="w-full mt-4 p-3 border rounded-lg h-32 text-sm focus:ring-2 focus:ring-blue-500"
                  maxLength={50000}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {cvText.length} / 50,000 字元
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  職位描述 (JD)
                </label>
                <textarea
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  placeholder="貼上職位描述..."
                  className="w-full p-3 border rounded-lg h-64 text-sm focus:ring-2 focus:ring-blue-500"
                  maxLength={50000}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {jdText.length} / 50,000 字元
                </p>
              </div>
            </div>
            <button
              onClick={analyzeATS}
              disabled={!cvText || !jdText || loading}
              className="mt-6 w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center transition"
            >
              {loading ? (
                <>
                  <Loader className="animate-spin mr-2" size={20} />
                  分析中...
                </>
              ) : (
                <>
                  開始分析 <ArrowRight className="ml-2" size={20} />
                </>
              )}
            </button>
          </div>
        )}

        {/* Step 2: ATS Results */}
        {step === 2 && atsResult && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-bold mb-6">ATS 分析結果</h2>
            
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-lg font-medium">ATS 匹配分數</span>
                <span className="text-3xl font-bold text-blue-600">
                  {atsResult.atsScore}/100
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className="bg-blue-600 h-4 rounded-full transition-all duration-500"
                  style={{ width: `${atsResult.atsScore}%` }}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div>
                <h3 className="font-semibold text-green-700 mb-3">✓ 已匹配關鍵字</h3>
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                  {atsResult.matchedKeywords?.map((kw, idx) => (
                    <span key={idx} className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-red-700 mb-3">✗ 缺失關鍵字</h3>
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                  {atsResult.missingKeywords?.map((kw, idx) => (
                    <span key={idx} className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {atsResult.analysis && (
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div className="p-4 bg-green-50 rounded-lg">
                  <h3 className="font-semibold text-green-800 mb-2">💪 優勢</h3>
                  <ul className="space-y-1">
                    {atsResult.analysis.strengths?.map((item, idx) => (
                      <li key={idx} className="text-sm text-green-700">• {item}</li>
                    ))}
                  </ul>
                </div>
                <div className="p-4 bg-orange-50 rounded-lg">
                  <h3 className="font-semibold text-orange-800 mb-2">⚠️ 待改進</h3>
                  <ul className="space-y-1">
                    {atsResult.analysis.weaknesses?.map((item, idx) => (
                      <li key={idx} className="text-sm text-orange-700">• {item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div className="mb-6">
              <h3 className="font-semibold text-gray-800 mb-3">📋 改進建議</h3>
              <ul className="space-y-2">
                {atsResult.suggestions?.map((sug, idx) => (
                  <li key={idx} className="flex items-start">
                    <span className="text-blue-600 mr-2 font-bold">{idx + 1}.</span>
                    <span className="text-gray-700">{sug}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={optimizeCV}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center transition"
            >
              {loading ? (
                <>
                  <Loader className="animate-spin mr-2" size={20} />
                  優化中...
                </>
              ) : (
                <>
                  開始優化 CV <ArrowRight className="ml-2" size={20} />
                </>
              )}
            </button>
          </div>
        )}

        {/* Step 3: Optimized CV */}
        {step === 3 && optimizedCV && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-bold mb-6">優化後的履歷</h2>
            
            <div className="mb-6 p-4 bg-gray-50 rounded-lg max-h-96 overflow-y-auto border">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">
                {optimizedCV}
              </pre>
            </div>

            <div className="flex gap-4">
              <button
                onClick={downloadOptimizedCV}
                className="flex-1 bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 flex items-center justify-center transition"
              >
                <Download className="mr-2" size={20} />
                下載優化後的 CV
              </button>
              <button
                onClick={generateInterviewQuestions}
                disabled={loading}
                className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center transition"
              >
                {loading ? (
                  <>
                    <Loader className="animate-spin mr-2" size={20} />
                    生成中...
                  </>
                ) : (
                  <>
                    生成面試問題 <ArrowRight className="ml-2" size={20} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Interview Questions */}
        {step === 4 && interviewQuestions && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-bold mb-6">模擬面試問題</h2>
            
            {interviewQuestions.summary && (
              <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                <p className="text-blue-800">
                  共生成 <strong>{interviewQuestions.summary.totalQuestions}</strong> 個問題：
                  技術 {interviewQuestions.summary.technicalCount} 個 • 
                  行為 {interviewQuestions.summary.behavioralCount} 個 • 
                  情境 {interviewQuestions.summary.situationalCount} 個
                </p>
              </div>
            )}
            
            <div className="space-y-8">
              {/* Technical Questions */}
              <div>
                <h3 className="text-xl font-semibold text-blue-600 mb-4">💼 技術問題</h3>
                {interviewQuestions.technicalQuestions?.map((q, idx) => (
                  <div key={idx} className="mb-4 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-600">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-medium text-gray-800 flex-1">
                        {idx + 1}. {q.question}
                      </p>
                      {q.difficulty && (
                        <span className={`ml-2 px-2 py-1 text-xs rounded ${
                          q.difficulty === '困難' ? 'bg-red-200 text-red-800' :
                          q.difficulty === '中等' ? 'bg-yellow-200 text-yellow-800' :
                          'bg-green-200 text-green-800'
                        }`}>
                          {q.difficulty}
                        </span>
                      )}
                    </div>
                    {q.category && (
                      <p className="text-xs text-blue-600 mb-2">分類：{q.category}</p>
                    )}
                    <div className="text-sm text-gray-600 pl-4">
                      <p className="font-medium mb-1">回答要點：</p>
                      <ul className="list-disc list-inside space-y-1">
                        {q.answerPoints?.map((point, i) => (
                          <li key={i}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>

              {/* Behavioral Questions */}
              <div>
                <h3 className="text-xl font-semibold text-green-600 mb-4">🎯 行為問題 (STAR)</h3>
                {interviewQuestions.behavioralQuestions?.map((q, idx) => (
                  <div key={idx} className="mb-4 p-4 bg-green-50 rounded-lg border-l-4 border-green-600">
                    <p className="font-medium text-gray-800 mb-2">
                      {idx + 1}. {q.question}
                    </p>
                    <div className="text-sm text-gray-600 pl-4">
                      <p className="font-medium mb-1">STAR 回答框架：</p>
                      <ul className="space-y-1">
                        {q.answerPoints?.map((point, i) => (
                          <li key={i} className="flex items-start">
                            <span className="font-semibold mr-2">•</span>
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>

              {/* Situational Questions */}
              <div>
                <h3 className="text-xl font-semibold text-purple-600 mb-4">🤔 情境問題</h3>
                {interviewQuestions.situationalQuestions?.map((q, idx) => (
                  <div key={idx} className="mb-4 p-4 bg-purple-50 rounded-lg border-l-4 border-purple-600">
                    <p className="font-medium text-gray-800 mb-2">
                      {idx + 1}. {q.question}
                    </p>
                    {q.expectedApproach && (
                      <div className="mb-2 text-sm text-purple-700 pl-4">
                        <p className="font-medium">期待的處理方式：</p>
                        <p>{q.expectedApproach.join(' → ')}</p>
                      </div>
                    )}
                    <div className="text-sm text-gray-600 pl-4">
                      <p className="font-medium mb-1">回答建議：</p>
                      <ul className="list-disc list-inside space-y-1">
                        {q.answerPoints?.map((point, i) => (
                          <li key={i}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>

              {/* Preparation Tips */}
              {interviewQuestions.preparationTips && interviewQuestions.preparationTips.length > 0 && (
                <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <h3 className="font-semibold text-yellow-800 mb-2">💡 準備建議</h3>
                  <ul className="space-y-1">
                    {interviewQuestions.preparationTips.map((tip, i) => (
                      <li key={i} className="text-sm text-yellow-700">• {tip}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <button
              onClick={resetAll}
              className="mt-8 w-full bg-gray-600 text-white py-3 rounded-lg font-medium hover:bg-gray-700 transition"
            >
              開始新的分析
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
