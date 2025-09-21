import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { 
  FileText, DollarSign, Clock, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle, 
  Search, Plus, Settings, LogOut, MapPin, Calendar, User, Building, Award, TrendingUp
} from 'lucide-react-native';
import { 
  getCurrentUser, 
  getUserProfile, 
  getTenders, 
  getUserBids, 
  createBid, 
  signOut 
} from '../lib/supabase';

export default function TenderDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('available');
  const [showBidForm, setShowBidForm] = useState(false);
  const [selectedTender, setSelectedTender] = useState(null);
  const [bidAmount, setBidAmount] = useState('');
  const [bidDetails, setBidDetails] = useState('');
  const [tenders, setTenders] = useState([]);
  const [userBids, setUserBids] = useState([]);
  const [stats, setStats] = useState({
    availableTenders: 0,
    activeBids: 0,
    wonContracts: 0,
    totalEarnings: 0,
    completionRate: 0,
    avgBidValue: 0,
  });

  useEffect(() => {
    checkContractorAccess();
  }, []);

  useEffect(() => {
    if (user && profile) {
      loadDashboardData();
    }
  }, [user, profile, selectedFilter]);

  const checkContractorAccess = async () => {
    try {
      const { user: currentUser, error: userError } = await getCurrentUser();
      if (userError || !currentUser) {
        Alert.alert('Access Denied', 'Please sign in to access contractor dashboard');
        router.replace('/auth');
        return;
      }

      const { data: profileData, error: profileError } = await getUserProfile(currentUser.id);
      if (profileError || !profileData || profileData.user_type !== 'tender') {
        Alert.alert('Access Denied', 'You do not have contractor privileges');
        router.replace('/(tabs)');
        return;
      }

      setUser(currentUser);
      setProfile(profileData);
    } catch (error) {
      console.error('Error checking contractor access:', error);
      router.replace('/auth');
    }
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Get all available tenders (including department-created ones)
      const { data: allTenders, error: tendersError } = await supabase
        .from('tenders')
        .select(`
          *,
          posted_by_profile:posted_by (
            full_name,
            user_type
          ),
          department:department_id (
            name,
            category
          ),
          source_issue:source_issue_id (
            title,
            category,
            location_name
          ),
          bids:bids (
            id,
            amount,
            user_id,
            status
          )
        `)
        .order('created_at', { ascending: false });

      if (tendersError) throw tendersError;

      const [bidsResult] = await Promise.all([
        getUserBids()
      ]);

      setTenders(allTenders || []);
      if (bidsResult.data) setUserBids(bidsResult.data);

      // Calculate stats
      const availableTenders = allTenders?.filter(t => t.status === 'available').length || 0;
      const activeBids = bidsResult.data?.filter(b => b.status === 'submitted').length || 0;
      const wonContracts = bidsResult.data?.filter(b => b.status === 'accepted').length || 0;
      
      setStats({
        availableTenders,
        activeBids,
        wonContracts,
        totalEarnings: wonContracts * 15000, // Placeholder calculation
        completionRate: wonContracts > 0 ? 94 : 0,
        avgBidValue: bidsResult.data?.length > 0 ? 
          bidsResult.data.reduce((sum, bid) => sum + (bid.amount || 0), 0) / bidsResult.data.length : 0
      });

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      Alert.alert('Error', 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
              router.replace('/auth');
            } catch (error) {
              Alert.alert('Error', 'Failed to logout');
            }
          }
        }
      ]
    );
  };

  const filters = [
    { id: 'available', label: 'Available', count: stats.availableTenders },
    { id: 'bidded', label: 'My Bids', count: stats.activeBids },
    { id: 'won', label: 'Won', count: stats.wonContracts },
    { id: 'completed', label: 'Completed', count: 0 },
  ];

  const getCategoryColor = (category) => {
    const colors = {
      roads: '#EF4444',
      utilities: '#F59E0B',
      maintenance: '#10B981',
      parks: '#8B5CF6',
      environment: '#06B6D4',
    };
    return colors[category] || '#6B7280';
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return '#EF4444';
      case 'medium': return '#F59E0B';
      case 'low': return '#10B981';
      default: return '#6B7280';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'available': return '#1E40AF';
      case 'bidded': return '#F59E0B';
      case 'won': return '#10B981';
      case 'completed': return '#6B7280';
      default: return '#6B7280';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'available': return <FileText size={16} color="#1E40AF" />;
      case 'bidded': return <Clock size={16} color="#F59E0B" />;
      case 'won': return <CheckCircle size={16} color="#10B981" />;
      case 'completed': return <CheckCircle size={16} color="#6B7280" />;
      default: return <AlertTriangle size={16} color="#6B7280" />;
    }
  };

  const handleBid = (tender) => {
    setSelectedTender(tender);
    setShowBidForm(true);
    setBidAmount('');
    setBidDetails('');
  };

  const submitBid = async () => {
    if (!bidAmount || !bidDetails) {
      Alert.alert('Error', 'Please fill in all bid information');
      return;
    }

    try {
      const bidData = {
        tender_id: selectedTender.id,
        amount: parseFloat(bidAmount),
        details: bidDetails,
        timeline: '30 days', // Default timeline
        methodology: bidDetails,
        status: 'submitted'
      };

      const { error } = await createBid(bidData);
      if (error) throw error;

      Alert.alert(
        'Bid Submitted',
        `Your bid of $${bidAmount} has been submitted successfully!`,
        [
          {
            text: 'OK',
            onPress: () => {
              setShowBidForm(false);
              setSelectedTender(null);
              setBidAmount('');
              setBidDetails('');
              loadDashboardData(); // Refresh data
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error submitting bid:', error);
      Alert.alert('Error', 'Failed to submit bid: ' + error.message);
    }
  };

  const filteredTenders = tenders.filter(tender => {
    switch (selectedFilter) {
      case 'available': return tender.status === 'available';
      case 'bidded': return userBids.some(bid => bid.tender_id === tender.id);
      case 'won': return userBids.some(bid => bid.tender_id === tender.id && bid.status === 'accepted');
      case 'completed': return tender.status === 'completed';
      default: return true;
    }
  });

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading contractor dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Contractor Portal</Text>
          <Text style={styles.contractorName}>
            Welcome, {profile?.full_name || profile?.first_name || 'Contractor'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerButton}>
            <Search size={20} color="#1E40AF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton}>
            <Settings size={20} color="#1E40AF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={handleLogout}>
            <LogOut size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats Overview */}
      <View style={styles.statsSection}>
        <Text style={styles.sectionTitle}>Business Overview</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <FileText size={20} color="#1E40AF" />
              <Text style={styles.statNumber}>{stats.availableTenders}</Text>
            </View>
            <Text style={styles.statLabel}>Available Tenders</Text>
          </View>
          
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <Clock size={20} color="#F59E0B" />
              <Text style={styles.statNumber}>{stats.activeBids}</Text>
            </View>
            <Text style={styles.statLabel}>Active Bids</Text>
          </View>
          
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <Award size={20} color="#10B981" />
              <Text style={styles.statNumber}>{stats.wonContracts}</Text>
            </View>
            <Text style={styles.statLabel}>Won Contracts</Text>
          </View>
          
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <TrendingUp size={20} color="#8B5CF6" />
              <Text style={styles.statNumber}>{formatCurrency(stats.totalEarnings)}</Text>
            </View>
            <Text style={styles.statLabel}>Total Earnings</Text>
          </View>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filtersSection}>
        <Text style={styles.sectionTitle}>Tender Opportunities</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filtersList}>
            {filters.map((filter) => (
              <TouchableOpacity
                key={filter.id}
                style={[
                  styles.filterChip,
                  selectedFilter === filter.id && styles.filterChipActive,
                ]}
                onPress={() => setSelectedFilter(filter.id)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedFilter === filter.id && styles.filterChipTextActive,
                  ]}
                >
                  {filter.label}
                </Text>
                <View style={styles.filterChipBadge}>
                  <Text style={styles.filterChipBadgeText}>{filter.count}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Tenders List */}
      <View style={styles.tendersSection}>
        <View style={styles.tendersList}>
          {filteredTenders.map((tender) => (
            <View key={tender.id} style={styles.tenderCard}>
              {/* Tender Header */}
              <View style={styles.tenderHeader}>
                <View style={styles.tenderStatus}>
                  {getStatusIcon(tender.status)}
                  <Text style={[styles.statusText, { color: getStatusColor(tender.status) }]}>
                    {tender.status.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.tenderMeta}>
                  <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(tender.priority) }]}>
                    <Text style={styles.priorityText}>{tender.priority.toUpperCase()}</Text>
                  </View>
                  <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(tender.category) + '20' }]}>
                    <Text style={[styles.categoryText, { color: getCategoryColor(tender.category) }]}>
                      {tender.category}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Tender Title and Description */}
              <Text style={styles.tenderTitle}>{tender.title}</Text>
              <Text style={styles.tenderDescription}>{tender.description}</Text>

              {/* Department Info */}
              {tender.department && (
                <View style={styles.departmentInfo}>
                  <Building size={14} color="#8B5CF6" />
                  <Text style={styles.departmentText}>
                    Posted by: {tender.department.name}
                  </Text>
                </View>
              )}

              {/* Source Issue Info */}
              {tender.source_issue && (
                <View style={styles.sourceIssueInfo}>
                  <AlertTriangle size={14} color="#F59E0B" />
                  <Text style={styles.sourceIssueText}>
                    Related to: {tender.source_issue.title}
                  </Text>
                </View>
              )}

              {/* Tender Details */}
              <View style={styles.tenderDetails}>
                <View style={styles.detailRow}>
                  <MapPin size={14} color="#6B7280" />
                  <Text style={styles.detailText}>
                    Location: {tender.source_issue?.location_name || tender.location || 'Not specified'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <DollarSign size={14} color="#10B981" />
                  <Text style={styles.detailText}>
                    Budget: {formatCurrency(tender.estimated_budget_min)} - {formatCurrency(tender.estimated_budget_max)}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Calendar size={14} color="#F59E0B" />
                  <Text style={styles.detailText}>Deadline: {formatDate(tender.deadline_date)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Users size={14} color="#8B5CF6" />
                  <Text style={styles.detailText}>
                    {tender.bids?.length || 0} total bids • Submission deadline: {formatDate(tender.submission_deadline)}
                  </Text>
                </View>
              </View>

              {/* Requirements */}
              {tender.requirements && tender.requirements.length > 0 && (
                <View style={styles.requirementsSection}>
                  <Text style={styles.requirementsTitle}>Requirements:</Text>
                  {tender.requirements.map((req, index) => (
                    <Text key={index} style={styles.requirement}>• {req}</Text>
                  ))}
                </View>
              )}

              {/* Tender Info */}
              <View style={styles.tenderInfo}>
                <Text style={styles.tenderInfoText}>
                  Posted {formatDate(tender.created_at)} • {tender.bids?.length || 0} bids
                </Text>
              </View>

              {/* My Bid Info */}
              {userBids.find(bid => bid.tender_id === tender.id) && (
                <View style={styles.myBidInfo}>
                  {(() => {
                    const myBid = userBids.find(bid => bid.tender_id === tender.id);
                    return (
                  <Text style={styles.myBidText}>
                        Your bid: {formatCurrency(myBid.amount)}
                        {myBid.status === 'accepted' && ` • Awarded`}
                  </Text>
                    );
                  })()}
                </View>
              )}

              {/* Action Buttons */}
              <View style={styles.tenderActions}>
                {tender.status === 'available' && !userBids.find(bid => bid.tender_id === tender.id) && (
                  <TouchableOpacity
                    style={[styles.actionButton, styles.bidButton]}
                    onPress={() => handleBid(tender)}
                  >
                    <Plus size={16} color="#FFFFFF" />
                    <Text style={styles.bidButtonText}>Submit Bid</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={[styles.actionButton, styles.detailsButton]}>
                  <Text style={styles.detailsButtonText}>View Details</Text>
                </TouchableOpacity>

                {userBids.find(bid => bid.tender_id === tender.id && bid.status === 'accepted') && (
                  <TouchableOpacity style={[styles.actionButton, styles.startButton]}>
                    <Text style={styles.startButtonText}>Start Work</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Bid Form Modal */}
      {showBidForm && selectedTender && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Submit Bid</Text>
            <Text style={styles.modalSubtitle}>{selectedTender.title}</Text>

            <View style={styles.bidForm}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Bid Amount ($)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your bid amount"
                  value={bidAmount}
                  onChangeText={setBidAmount}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Bid Details</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Describe your approach, timeline, materials, etc."
                  value={bidDetails}
                  onChangeText={setBidDetails}
                  multiline
                  numberOfLines={4}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowBidForm(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.submitButton]}
                onPress={submitBid}
              >
                <Text style={styles.submitButtonText}>Submit Bid</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',

    // ✅ new shadow API
    boxShadow: "0px 2px 4px rgba(0, 0, 0, 0.1)",

    // ✅ keep elevation for Android
    elevation: 4,
  },
  greeting: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  contractorName: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    width: 36,
    height: 36,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statsSection: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  filtersSection: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    marginBottom: 8,
  },
  filtersList: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  filterChipActive: {
    backgroundColor: '#1E40AF',
    borderColor: '#1E40AF',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  filterChipBadge: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 16,
    alignItems: 'center',
  },
  filterChipBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#374151',
  },
  tendersSection: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 20,
  },
  tendersList: {
    gap: 20,
  },
  tenderCard: {
    backgroundColor: '#F9FAFB',
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tenderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  tenderStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tenderMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  priorityText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  tenderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  tenderDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 16,
  },
  departmentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
    marginBottom: 8,
  },
  departmentText: {
    fontSize: 12,
    color: '#8B5CF6',
    fontWeight: '600',
  },
  sourceIssueInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
    marginBottom: 12,
  },
  sourceIssueText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '500',
  },
  tenderDetails: {
    gap: 8,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#374151',
  },
  requirementsSection: {
    marginBottom: 16,
  },
  requirementsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  requirement: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  tenderInfo: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 12,
    marginBottom: 12,
  },
  tenderInfoText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  myBidInfo: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 16,
  },
  myBidText: {
    fontSize: 14,
    color: '#0369A1',
    fontWeight: '600',
  },
  tenderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bidButton: {
    backgroundColor: '#1E40AF',
    flexDirection: 'row',
    gap: 6,
  },
  bidButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  detailsButton: {
    backgroundColor: '#E5E7EB',
  },
  detailsButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  startButton: {
    backgroundColor: '#10B981',
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 20,
  },
  bidForm: {
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#E5E7EB',
  },
  cancelButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#1E40AF',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});