'use client';

import { useState, useCallback, useMemo } from 'react';
import FileUploader from '../components/Upload/FileUploader';
import OrderTable from '../components/Orders/OrderTable';
import Loading from '../components/Common/Loading';
import ProgressBar from '../components/Common/ProgressBar';
import Toast, { showToast } from '../components/Common/Toast';
import { useDebounce } from '../hooks/useDebounce';
import { useLargeData } from '../hooks/useLargeData';
import type { ParsedOrder, ParseRule } from '@/types/rule';

type TabType = 'upload' | 'rules' | 'orders';

export default function ImportPage() {
  const [activeTab, setActiveTab] = useState<TabType>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentRule, setCurrentRule] = useState<ParseRule | null>(null);
  const [generatingRule, setGeneratingRule] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // 使用大数据分页Hook
  const {
    data: orders,
    setData: setOrders,
    displayedData: displayedOrders,
    totalCount,
    currentPage,
    totalPages,
    isLoading: isLoadingMore,
    loadMore,
    goToPage,
  } = useLargeData<ParsedOrder>({ pageSize: 100 });
  
  // 防抖搜索
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  
  // 过滤后的订单
  const filteredOrders = useMemo(() => {
    if (!debouncedSearchQuery) return displayedOrders;
    
    const query = debouncedSearchQuery.toLowerCase();
    return displayedOrders.filter(order => 
      (order.orderNo?.toLowerCase().includes(query)) ||
      (order.receiverName?.toLowerCase().includes(query)) ||
      (order.receiverPhone?.includes(query)) ||
      (order.itemName?.toLowerCase().includes(query))
    );
  }, [displayedOrders, debouncedSearchQuery]);
  
  // 是否使用虚拟滚动（超过100条记录）
  const useVirtualScroll = totalCount > 100;

  // 处理文件选择
  const handleFilesSelected = useCallback((newFiles: File[]) => {
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  // AI生成规则
  const handleGenerateRule = async (file: File) => {
    setGeneratingRule(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/rules/generate', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setCurrentRule(data.rule);
        showToast('success', 'AI规则生成成功');
      } else {
        showToast('error', data.error || '规则生成失败');
      }
    } catch (error) {
      showToast('error', '规则生成失败');
    } finally {
      setGeneratingRule(false);
    }
  };

  // 解析文件
  const handleParse = async () => {
    if (files.length === 0) {
      showToast('warning', '请先选择文件');
      return;
    }

    setParsing(true);
    setProgress(0);
    setOrders([]);
    setSelectedIndices([]);

    try {
      const allOrders: ParsedOrder[] = [];
      const totalFiles = files.length;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(((i + 0.5) / totalFiles) * 100);

        const formData = new FormData();
        formData.append('file', file);
        if (currentRule) {
          formData.append('rule', JSON.stringify(currentRule));
        }

        const response = await fetch('/api/parse', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (data.success) {
          allOrders.push(...data.orders);
          showToast('success', `${file.name} 解析完成，${data.totalRows} 条记录`);
        } else {
          showToast('error', `${file.name} 解析失败: ${data.error}`);
        }

        setProgress(((i + 1) / totalFiles) * 100);
      }

      setOrders(allOrders);
      setActiveTab('orders');
      showToast('success', `全部解析完成，共 ${allOrders.length} 条记录`);
    } catch (error) {
      showToast('error', '解析过程中发生错误');
    } finally {
      setParsing(false);
    }
  };

  // 导出Excel
  const handleExport = async () => {
    if (orders.length === 0) {
      showToast('warning', '没有可导出的数据');
      return;
    }

    try {
      const exportData = selectedIndices.length > 0 
        ? orders.filter((_, i) => selectedIndices.includes(i)) 
        : filteredOrders;
      
      const response = await fetch('/api/orders/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orders: exportData }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `运单数据_${Date.now()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('success', '导出成功');
      } else {
        showToast('error', '导出失败');
      }
    } catch (error) {
      showToast('error', '导出失败');
    }
  };

  // 删除选中订单
  const handleDeleteSelected = () => {
    if (selectedIndices.length === 0) {
      showToast('warning', '请先选择要删除的记录');
      return;
    }
    setOrders((prev: ParsedOrder[]) => prev.filter((_, i) => !selectedIndices.includes(i)));
    setSelectedIndices([]);
    showToast('success', `已删除 ${selectedIndices.length} 条记录`);
  };

  // 编辑订单
  const handleEditOrder = (index: number, order: ParsedOrder) => {
    const newValue = prompt('请输入新的收货人姓名', order.receiverName || '');
    if (newValue !== null) {
      setOrders((prev: ParsedOrder[]) => {
        const newOrders = [...prev];
        newOrders[index] = { ...newOrders[index], receiverName: newValue };
        return newOrders;
      });
    }
  };

  // 删除单个订单
  const handleDeleteOrder = (index: number) => {
    setOrders((prev: ParsedOrder[]) => prev.filter((_, i) => i !== index));
    showToast('success', '已删除');
  };

  // 批量提交下单
  const handleSubmitOrders = async () => {
    if (orders.length === 0) {
      showToast('warning', '没有可提交的数据');
      return;
    }

    const submitData = selectedIndices.length > 0 
      ? orders.filter((_, i) => selectedIndices.includes(i)) 
      : filteredOrders;

    showToast('info', `准备提交 ${submitData.length} 条运单...`);
    
    // 模拟提交过程
    // 实际项目中这里会调用API
    showToast('success', `成功提交 ${submitData.length} 条运单`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Toast />
      
      {/* 顶部导航 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#0fc6c2] rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">万能导入 V2</h1>
                <p className="text-xs text-gray-500">智能多格式批量下单系统</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {orders.length > 0 && (
                <span className="text-sm text-gray-600">
                  已解析 <span className="font-medium text-[#0fc6c2]">{orders.length}</span> 条运单
                  {useVirtualScroll && (
                    <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                      虚拟滚动
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 标签页 */}
        <div className="flex gap-1 mb-6 bg-white rounded-lg p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'upload'
                ? 'bg-[#0fc6c2] text-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            📁 文件上传
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'rules'
                ? 'bg-[#0fc6c2] text-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            📋 解析规则
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'orders'
                ? 'bg-[#0fc6c2] text-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            📊 运单数据 {orders.length > 0 && `(${orders.length})`}
          </button>
        </div>

        {/* 文件上传页 */}
        {activeTab === 'upload' && (
          <div className="space-y-6">
            <FileUploader onFilesSelected={handleFilesSelected} />

            {/* 已选文件列表 */}
            {files.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">已选择的文件</h3>
                <ul className="space-y-2">
                  {files.map((file, index) => (
                    <li key={index} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <svg className="w-5 h-5 text-[#0fc6c2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <div>
                          <span className="text-sm text-gray-700">{file.name}</span>
                          <span className="text-xs text-gray-400 ml-2">
                            ({(file.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleGenerateRule(file)}
                          disabled={generatingRule}
                          className="text-xs text-[#0fc6c2] hover:text-[#0aa8a4] disabled:opacity-50"
                        >
                          {generatingRule ? '生成中...' : 'AI生成规则'}
                        </button>
                        <button
                          onClick={() => setFiles(prev => prev.filter((_, i) => i !== index))}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          移除
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 当前规则 */}
            {currentRule && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">当前解析规则</h3>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">{currentRule.name}</span>
                    <span className="text-xs text-[#0fc6c2] bg-[#0fc6c2]/10 px-2 py-1 rounded">
                      {currentRule.parser.type}
                    </span>
                  </div>
                  {currentRule.description && (
                    <p className="text-sm text-gray-600">{currentRule.description}</p>
                  )}
                  <button
                    onClick={() => setCurrentRule(null)}
                    className="text-xs text-red-500 hover:text-red-700 mt-2"
                  >
                    清除规则
                  </button>
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-4">
              <button
                onClick={handleParse}
                disabled={files.length === 0 || parsing}
                className="flex-1 px-6 py-3 bg-[#0fc6c2] text-white rounded-lg font-medium hover:bg-[#0aa8a4] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {parsing ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loading size="sm" />
                    <span>解析中... {Math.round(progress)}%</span>
                  </div>
                ) : (
                  '开始解析'
                )}
              </button>
            </div>

            {/* 解析进度 */}
            {parsing && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Loading size="sm" />
                  <span className="text-sm text-gray-700">正在解析文件...</span>
                </div>
                <ProgressBar progress={progress} />
                <p className="text-xs text-gray-500 mt-2">
                  已解析 {Math.round(progress / 100 * files.length)} / {files.length} 个文件
                </p>
              </div>
            )}
          </div>
        )}

        {/* 规则页 */}
        {activeTab === 'rules' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">解析规则管理</h3>
            <p className="text-gray-600 mb-4">
              规则引擎支持多种解析模式：标准表格、矩阵转置、卡片识别、纯文本提取等。
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* 规则类型卡片 */}
              {[
                { type: 'table', name: '标准表格', desc: '有明确表头和数据行的表格格式', icon: '📊' },
                { type: 'matrix', name: '矩阵转置', desc: 'SKU×门店矩阵，需转置为独立记录', icon: '🔄' },
                { type: 'card', name: '卡片识别', desc: '多个独立卡片堆叠的格式', icon: '🎴' },
                { type: 'text', name: '纯文本提取', desc: '无表格，用正则表达式提取', icon: '📝' },
                { type: 'multi-sheet', name: '多Sheet合并', desc: 'Excel多个Sheet独立解析后合并', icon: '📑' },
                { type: 'multi-page', name: '多页拆分', desc: 'PDF含多个独立单元，需拆分', icon: '📄' },
              ].map((item) => (
                <div
                  key={item.type}
                  className="border border-gray-200 rounded-lg p-4 hover:border-[#0fc6c2] hover:shadow-md transition-all cursor-pointer"
                  onClick={() => {
                    showToast('info', `选择${item.name}规则`);
                  }}
                >
                  <div className="text-3xl mb-2">{item.icon}</div>
                  <h4 className="font-medium text-gray-900 mb-1">{item.name}</h4>
                  <p className="text-sm text-gray-600">{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">💡 使用提示</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• 上传文件后，点击"AI生成规则"可自动生成解析规则</li>
                <li>• 系统会根据文件结构智能匹配最佳解析模式</li>
                <li>• 规则可手动微调，满足特殊格式需求</li>
                <li>• 新增第5、第10种格式时，系统代码零改动</li>
              </ul>
            </div>
          </div>
        )}

        {/* 运单数据页 */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            {/* 操作栏 */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleExport}
                    disabled={orders.length === 0}
                    className="px-4 py-2 bg-[#0fc6c2] text-white rounded-lg text-sm font-medium hover:bg-[#0aa8a4] disabled:opacity-50 transition-colors"
                  >
                    📥 导出Excel
                  </button>
                  <button
                    onClick={handleDeleteSelected}
                    disabled={selectedIndices.length === 0}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
                  >
                    🗑️ 删除选中 ({selectedIndices.length})
                  </button>
                  <button
                    onClick={handleSubmitOrders}
                    disabled={orders.length === 0}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 disabled:opacity-50 transition-colors"
                  >
                    🚀 批量提交下单
                  </button>
                </div>
                
                <div className="flex items-center gap-4">
                  {/* 搜索框 */}
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="搜索运单号、收货人、电话..."
                      className="w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc6c2] focus:border-transparent"
                    />
                    <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  
                  {/* 统计信息 */}
                  <div className="text-sm text-gray-600">
                    {orders.length > 0 && (
                      <>
                        共 <span className="font-medium text-[#0fc6c2]">{totalCount}</span> 条
                        {debouncedSearchQuery && (
                          <span className="ml-1">
                            (筛选 {filteredOrders.length} 条)
                          </span>
                        )}
                        {orders.filter(o => !o.isValid).length > 0 && (
                          <span className="ml-2 text-red-500">
                            ({orders.filter(o => !o.isValid).length} 条有误)
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 运单表格 */}
            <OrderTable
              orders={filteredOrders}
              selectable
              selectedIndices={selectedIndices}
              onSelectionChange={setSelectedIndices}
              onEdit={handleEditOrder}
              onDelete={handleDeleteOrder}
              useVirtualScroll={useVirtualScroll}
              virtualHeight={600}
            />

            {/* 分页/加载更多 */}
            {totalCount > 100 && (
              <div className="bg-white rounded-lg border border-gray-200 p-4 flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  显示 {displayedOrders.length} / {totalCount} 条
                  {totalPages > 1 && (
                    <span className="ml-2">
                      (第 {currentPage}/{totalPages} 页)
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={loadMore}
                    disabled={currentPage >= totalPages || isLoadingMore}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50 transition-colors"
                  >
                    {isLoadingMore ? '加载中...' : '加载更多'}
                  </button>
                  {totalPages > 1 && (
                    <div className="flex gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const page = i + 1;
                        return (
                          <button
                            key={page}
                            onClick={() => goToPage(page)}
                            className={`w-8 h-8 rounded text-sm ${
                              currentPage === page
                                ? 'bg-[#0fc6c2] text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
